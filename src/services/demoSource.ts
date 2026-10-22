import type { FixId, Sample } from '../types';
import type { PlanResult } from './obsFixes';

/**
 * Datos simulados para probar el panel SIN abrir OBS.
 * Recorre en bucle: normal → problema de red → normal → problema de GPU → normal → problema de codificador.
 */
type Scenario = 'normal' | 'network' | 'gpu' | 'encoder';

const CYCLE: Array<[Scenario, number]> = [
  ['normal', 25],
  ['network', 35],
  ['normal', 20],
  ['gpu', 35],
  ['normal', 20],
  ['encoder', 35],
];

export class DemoSource {
  private timer: number | undefined;
  private tick = 0;
  private frames = 0;
  private netDropped = 0;
  private renderSkipped = 0;
  private encSkipped = 0;
  private bytes = 0;

  constructor(private readonly onSample: (s: Sample) => void) {}

  start(): void {
    this.stop();
    this.emit();
    this.timer = window.setInterval(() => this.emit(), 1000);
  }

  stop(): void {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private scenario(): Scenario {
    const total = CYCLE.reduce((a, [, d]) => a + d, 0);
    let t = this.tick % total;
    for (const [s, d] of CYCLE) {
      if (t < d) return s;
      t -= d;
    }
    return 'normal';
  }

  private emit(): void {
    const sc = this.scenario();
    this.tick++;
    const fps = 30;
    const jitter = () => Math.random() * 0.002;

    this.frames += fps;
    this.netDropped += fps * (sc === 'network' ? 0.02 + jitter() : 0.0005 + jitter());
    this.renderSkipped += fps * (sc === 'gpu' ? 0.015 + jitter() : 0.0005 + jitter());
    this.encSkipped += fps * (sc === 'encoder' ? 0.02 + jitter() : 0.0003 + jitter());
    const bitrate = sc === 'network' ? 3800 + Math.random() * 1500 : 6000 + Math.random() * 120 - 60;
    this.bytes += (bitrate * 1000) / 8;

    const total = Math.floor(this.frames);
    this.onSample({
      t: Date.now(),
      streaming: true,
      reconnecting: false,
      targetFps: fps,
      activeFps: sc === 'gpu' || sc === 'encoder' ? 27 + Math.random() * 1.5 : 29.9 + Math.random() * 0.2,
      cpuUsage: sc === 'encoder' ? 92 + Math.random() * 4 : 28 + Math.random() * 6,
      avgRenderMs: sc === 'gpu' ? 34 + Math.random() * 4 : 6 + Math.random() * 2,
      renderSkipped: Math.floor(this.renderSkipped),
      renderTotal: total,
      encSkipped: Math.floor(this.encSkipped),
      encTotal: total,
      netDropped: Math.floor(this.netDropped),
      netTotal: total,
      congestion: sc === 'network' ? 0.4 + Math.random() * 0.4 : 0.02,
      bitrateKbps: bitrate,
    });
  }
}

/** En modo demo los arreglos solo muestran qué harían. */
export async function demoPlanFix(id: FixId): Promise<PlanResult> {
  const text: Record<FixId, string> = {
    'lower-bitrate': 'Bajar el bitrate de 6000 a 4800 kbps.',
    'disable-browser-sources': 'Ocultar las fuentes de navegador "Alertas" y "Chat" de la escena actual.',
    'faster-preset': 'Cambiar el preset de x264 de "medium" a "veryfast".',
    'lower-resolution': 'Bajar la resolución de salida de 1920×1080 a 1280×720.',
  };
  return {
    ok: true,
    plan: {
      summary: `(Demo) ${text[id]}`,
      apply: async () => ({
        message: '(Demo) En tu OBS real este cambio se habría aplicado. Aquí no se toca nada.',
        undo: async () => '(Demo) Cambio deshecho.',
      }),
    },
  };
}
