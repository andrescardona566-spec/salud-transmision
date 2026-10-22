import {
  EMPTY_REPORT,
  type Diagnosis,
  type FixId,
  type HealthReport,
  type Level,
  type MetricKey,
  type Metrics,
  type Sample,
} from '../types';

/* ------------------------------------------------------------------ */
/*  Umbrales (todos ajustables desde un solo lugar)                    */
/* ------------------------------------------------------------------ */

export interface Thresholds {
  windowMs: number; // tamaño de la ventana deslizante
  minSpanMs: number; // mínimo de datos antes de opinar (evita falsas alarmas al inicio)
  network: { warn: number; crit: number }; // % de cuadros perdidos por red
  render: { warn: number; crit: number }; // % de cuadros que la GPU no alcanzó a renderizar
  encoder: { warn: number; crit: number }; // % de cuadros saltados por el codificador
  congestion: { warn: number; crit: number }; // 0..1 que reporta OBS
  cpuWarn: number; // % de CPU de OBS
  fpsRatio: { warn: number; crit: number }; // FPS reales / FPS objetivo (menor = peor)
  holdTicks: number; // segundos seguidos "mejor" antes de bajar el nivel (anti-parpadeo)
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  windowMs: 20_000,
  minSpanMs: 8_000,
  network: { warn: 0.5, crit: 1.5 },
  render: { warn: 0.5, crit: 1.0 },
  encoder: { warn: 0.5, crit: 1.0 },
  congestion: { warn: 0.25, crit: 0.6 },
  cpuWarn: 85,
  fpsRatio: { warn: 0.97, crit: 0.9 },
  holdTicks: 3,
};

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

const RANK: Record<Level, number> = { ok: 0, warn: 1, crit: 2 };
const maxLevel = (...ls: Level[]): Level =>
  ls.reduce<Level>((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');

/** Nivel cuando "más alto = peor". */
function levelHigh(v: number | null, t: { warn: number; crit: number }): Level {
  if (v === null) return 'ok';
  return v >= t.crit ? 'crit' : v >= t.warn ? 'warn' : 'ok';
}

/** Nivel cuando "más bajo = peor" (FPS). */
function levelLow(v: number | null, t: { warn: number; crit: number }): Level {
  if (v === null) return 'ok';
  return v < t.crit ? 'crit' : v < t.warn ? 'warn' : 'ok';
}

/** % de cuadros perdidos entre dos contadores acumulativos. null si no hay suficientes cuadros. */
function lossPct(
  skippedFirst: number,
  skippedLast: number,
  totalFirst: number,
  totalLast: number,
): number | null {
  const frames = totalLast - totalFirst;
  if (frames < 30) return null;
  return Math.max(0, ((skippedLast - skippedFirst) / frames) * 100);
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

function std(xs: number[]): number | null {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

const f1 = (n: number) => n.toFixed(1).replace('.', ',');
const f2 = (n: number) => n.toFixed(2).replace('.', ',');

type Category = 'network' | 'gpu' | 'encoder' | 'fps';

/* ------------------------------------------------------------------ */
/*  Motor                                                              */
/* ------------------------------------------------------------------ */

export class HealthEngine {
  private samples: Sample[] = [];
  private held: Record<Category, { level: Level; calmTicks: number }> = this.freshHeld();

  constructor(private readonly th: Thresholds = DEFAULT_THRESHOLDS) {}

  private freshHeld() {
    return {
      network: { level: 'ok' as Level, calmTicks: 0 },
      gpu: { level: 'ok' as Level, calmTicks: 0 },
      encoder: { level: 'ok' as Level, calmTicks: 0 },
      fps: { level: 'ok' as Level, calmTicks: 0 },
    };
  }

  reset(): void {
    this.samples = [];
    this.held = this.freshHeld();
  }

  /** Añade una muestra y devuelve el diagnóstico actualizado. */
  push(s: Sample): HealthReport {
    const prev = this.samples[this.samples.length - 1];
    if (prev) {
      const countersReset =
        s.renderTotal < prev.renderTotal ||
        s.encTotal < prev.encTotal ||
        (s.streaming && prev.streaming && s.netTotal < prev.netTotal);
      if (countersReset || prev.streaming !== s.streaming) this.reset();
    }
    this.samples.push(s);
    const cutoff = s.t - this.th.windowMs;
    while (this.samples.length > 1 && this.samples[0].t < cutoff) this.samples.shift();
    return this.evaluate();
  }

  /** Sube el nivel al instante; lo baja solo tras `holdTicks` evaluaciones tranquilas. */
  private hold(cat: Category, raw: Level): Level {
    const h = this.held[cat];
    if (RANK[raw] >= RANK[h.level]) {
      h.level = raw;
      h.calmTicks = 0;
    } else if (++h.calmTicks >= this.th.holdTicks) {
      h.level = raw;
      h.calmTicks = 0;
    }
    return h.level;
  }

  private evaluate(): HealthReport {
    const w = this.samples;
    const first = w[0];
    const last = w[w.length - 1];
    const spanMs = last.t - first.t;
    const ready = spanMs >= this.th.minSpanMs;

    /* ---- Métricas promediadas sobre la ventana ---- */
    const networkLossPct = last.streaming
      ? lossPct(first.netDropped, last.netDropped, first.netTotal, last.netTotal)
      : null;
    const renderLagPct = lossPct(first.renderSkipped, last.renderSkipped, first.renderTotal, last.renderTotal);
    const encoderLagPct = lossPct(first.encSkipped, last.encSkipped, first.encTotal, last.encTotal);
    const fpsList = w.map((x) => x.activeFps).filter((x) => x > 0);
    const bitrates = w.map((x) => x.bitrateKbps).filter((x): x is number => x !== null);

    const metrics: Metrics = {
      networkLossPct,
      renderLagPct,
      encoderLagPct,
      cpuAvg: mean(w.map((x) => x.cpuUsage)),
      fpsAvg: mean(fpsList),
      fpsStd: std(fpsList),
      targetFps: last.targetFps || null,
      bitrateKbps: mean(bitrates),
      congestion: last.streaming ? mean(w.map((x) => x.congestion)) : null,
      avgRenderMs: mean(w.map((x) => x.avgRenderMs)),
      windowSec: Math.round(spanMs / 1000),
    };

    if (!ready && !last.reconnecting) {
      return {
        ...EMPTY_REPORT,
        phase: 'calibrating',
        headline: `Midiendo… (${Math.max(0, Math.round(spanMs / 1000))} de ${Math.round(this.th.minSpanMs / 1000)} s)`,
        streaming: last.streaming,
        metrics,
      };
    }

    /* ---- Niveles "crudos" ---- */
    const frameMs = last.targetFps > 0 ? 1000 / last.targetFps : 33.3;
    const fpsRatio = metrics.fpsAvg !== null && last.targetFps > 0 ? metrics.fpsAvg / last.targetFps : null;

    const rawNetwork: Level = last.reconnecting
      ? 'crit'
      : maxLevel(levelHigh(networkLossPct, this.th.network), levelHigh(metrics.congestion, this.th.congestion));

    const renderTimeLevel: Level =
      metrics.avgRenderMs === null ? 'ok' : metrics.avgRenderMs >= frameMs ? 'crit' : metrics.avgRenderMs >= frameMs * 0.8 ? 'warn' : 'ok';
    const rawGpu = maxLevel(levelHigh(renderLagPct, this.th.render), renderTimeLevel);

    const cpuLevel: Level = metrics.cpuAvg !== null && metrics.cpuAvg >= this.th.cpuWarn ? 'warn' : 'ok';
    const rawEncoder = maxLevel(levelHigh(encoderLagPct, this.th.encoder), cpuLevel);

    const rawFps = levelLow(fpsRatio, this.th.fpsRatio);

    const network = this.hold('network', rawNetwork);
    const gpu = this.hold('gpu', rawGpu);
    const encoder = this.hold('encoder', rawEncoder);
    const fps = this.hold('fps', rawFps);

    /* ---- Diagnósticos en lenguaje natural ---- */
    const diagnoses: Diagnosis[] = [];
    const secs = Math.max(1, Math.round(spanMs / 1000));

    if (network !== 'ok') {
      const crit = network === 'crit';
      const pctTxt = networkLossPct !== null ? `${f2(networkLossPct)} % de los cuadros` : 'algunos cuadros';
      const congTxt =
        metrics.congestion !== null && metrics.congestion >= this.th.congestion.warn
          ? ` OBS también reporta congestión de red (${Math.round(metrics.congestion * 100)} %).`
          : '';
      diagnoses.push({
        id: 'network',
        category: 'network',
        level: network,
        title: last.reconnecting
          ? 'OBS perdió la conexión con la plataforma'
          : crit
            ? 'Tu internet no está dejando salir la transmisión'
            : 'Tu conexión de subida está algo inestable',
        explanation: last.reconnecting
          ? 'OBS está intentando reconectarse con la plataforma. Tus espectadores pueden ver cortes o pantalla congelada.'
          : `En los últimos ${secs} s se perdió ${pctTxt} al enviarlos por internet (lo sano es menos de ${f1(this.th.network.warn)} %). ` +
            `Esto pasa cuando la subida de tu internet se congestiona o el Wi-Fi tiene interferencia.${congTxt}`,
        advice: [
          'Si estás por Wi-Fi, conecta el PC con cable de red (Ethernet): es lo que más ayuda.',
          'Pausa descargas, actualizaciones y videos en otros dispositivos de tu red.',
          crit
            ? 'Baja el bitrate YA (botón de abajo) y, si sigue igual, prueba un servidor de ingesta más cercano.'
            : 'Si no mejora, baja el bitrate un 20 % (botón de abajo).',
        ],
        fixes: ['lower-bitrate'],
      });
    }

    if (gpu !== 'ok') {
      const crit = gpu === 'crit';
      const pctTxt = renderLagPct !== null ? `${f2(renderLagPct)} % de los cuadros` : 'algunos cuadros';
      const msTxt =
        metrics.avgRenderMs !== null && metrics.avgRenderMs >= frameMs * 0.8
          ? ` Cada cuadro tarda ${f1(metrics.avgRenderMs)} ms en dibujarse y solo tienes ${f1(frameMs)} ms disponibles.`
          : '';
      diagnoses.push({
        id: 'gpu',
        category: 'gpu',
        level: gpu,
        title: crit ? 'Tu tarjeta gráfica no da abasto' : 'Tu tarjeta gráfica va muy justa',
        explanation:
          `OBS no alcanzó a dibujar ${pctTxt} en los últimos ${secs} s (lo sano es menos de ${f1(this.th.render.warn)} %).${msTxt} ` +
          'Casi siempre es por fuentes pesadas: navegadores (alertas, chat, widgets), capturas de juego o filtros de video.',
        advice: [
          'Apaga o quita las fuentes de navegador que no uses (alertas, chat, overlays animados).',
          'Baja los FPS de salida a 30 en Ajustes → Video, si estás en 60.',
          'Cierra programas que usan la GPU: Chrome con muchas pestañas, otros juegos, editores de video.',
          'En Windows, ajusta OBS a "Alto rendimiento" en Configuración → Pantalla → Gráficos.',
        ],
        fixes: ['disable-browser-sources'],
      });
    }

    if (encoder !== 'ok') {
      const crit = encoder === 'crit';
      const lagTxt =
        encoderLagPct !== null && encoderLagPct >= this.th.encoder.warn
          ? `El codificador se retrasó y saltó ${f2(encoderLagPct)} % de los cuadros en los últimos ${secs} s. `
          : '';
      const cpuTxt =
        metrics.cpuAvg !== null && metrics.cpuAvg >= this.th.cpuWarn
          ? `Además OBS está usando ${Math.round(metrics.cpuAvg)} % de CPU. `
          : '';
      diagnoses.push({
        id: 'encoder',
        category: 'encoder',
        level: encoder,
        title: crit ? 'El codificador no está pudiendo con el video' : 'El codificador va al límite',
        explanation:
          `${lagTxt}${cpuTxt}` +
          'El "codificador" es la parte de OBS que comprime el video para enviarlo; si tu PC no es lo bastante rápida, se atrasa.',
        advice: [
          'Si usas x264 (CPU): en Ajustes → Salida pon un preset más rápido (veryfast o superfast).',
          'Si tu PC tiene tarjeta NVIDIA o AMD: cambia el codificador a NVENC / AMF; usa mucho menos CPU.',
          'Baja la resolución de salida a 1280×720 (o a 30 FPS) para quitarle carga al codificador.',
          'Cierra programas pesados que compitan por el CPU mientras transmites.',
        ],
        fixes: ['faster-preset', 'lower-resolution'],
      });
    }

    // Los FPS bajos suelen ser consecuencia de lo anterior; solo se avisan si nada más lo explica.
    if (fps !== 'ok' && network === 'ok' && gpu === 'ok' && encoder === 'ok') {
      const target = last.targetFps > 0 ? Math.round(last.targetFps) : 30;
      diagnoses.push({
        id: 'fps',
        category: 'fps',
        level: fps,
        title: 'Los FPS no se mantienen estables',
        explanation:
          `OBS promedia ${f1(metrics.fpsAvg ?? 0)} FPS cuando debería dar ${target}` +
          (metrics.fpsStd !== null ? ` (variación de ±${f1(metrics.fpsStd)}).` : '.') +
          ' No hay una causa clara en red, GPU o codificador; suele ser otra aplicación robando recursos.',
        advice: [
          'Pon el plan de energía de Windows en "Alto rendimiento".',
          'Cierra programas en segundo plano (navegadores, launchers, antivirus escaneando).',
          'Revisa que la fuente de captura (cámara o juego) también esté trabajando a los FPS que configuraste.',
        ],
        fixes: [] as FixId[],
      });
    }

    diagnoses.sort((a, b) => RANK[b.level] - RANK[a.level]);
    const overall = maxLevel(network, gpu, encoder, fps);

    const headline =
      overall === 'crit'
        ? 'Hay un problema que afecta tu transmisión ahora'
        : overall === 'warn'
          ? 'Atención: algo empieza a fallar'
          : last.streaming
            ? 'Todo en orden, transmisión saludable'
            : 'OBS está bien (aún no transmites)';

    const levels: Record<MetricKey, Level> = { network, gpu, encoder, cpu: cpuLevel, fps };

    return { phase: 'ready', overall, headline, streaming: last.streaming, metrics, levels, diagnoses };
  }
}
