// Tipos compartidos por el servicio de OBS, el motor de diagnóstico y la interfaz.

export type Level = 'ok' | 'warn' | 'crit';
export type MetricKey = 'network' | 'gpu' | 'encoder' | 'cpu' | 'fps';

export type FixId =
  | 'lower-bitrate'
  | 'disable-browser-sources'
  | 'faster-preset'
  | 'lower-resolution';

export const FIX_LABELS: Record<FixId, string> = {
  'lower-bitrate': 'Bajar bitrate 20 %',
  'disable-browser-sources': 'Apagar fuentes de navegador',
  'faster-preset': 'Usar un preset más rápido',
  'lower-resolution': 'Bajar la salida a 720p',
};

/**
 * Una "foto" de OBS tomada cada segundo.
 * Los contadores (…Skipped / …Total) son acumulativos: el motor calcula la
 * diferencia dentro de la ventana deslizante.
 */
export interface Sample {
  t: number; // ms (Date.now())
  streaming: boolean;
  reconnecting: boolean;
  targetFps: number;
  activeFps: number;
  cpuUsage: number; // % de CPU que usa el proceso de OBS
  avgRenderMs: number; // tiempo medio de render por cuadro
  renderSkipped: number; // GetStats.renderSkippedFrames  -> cuadros que la GPU no alcanzó a renderizar
  renderTotal: number;
  encSkipped: number; // GetStats.outputSkippedFrames   -> cuadros saltados por retraso del codificador
  encTotal: number;
  netDropped: number; // GetStreamStatus.outputSkippedFrames -> cuadros descartados por la red
  netTotal: number;
  congestion: number; // 0..1 (GetStreamStatus.outputCongestion)
  bitrateKbps: number | null;
}

export interface Metrics {
  networkLossPct: number | null;
  renderLagPct: number | null;
  encoderLagPct: number | null;
  cpuAvg: number | null;
  fpsAvg: number | null;
  fpsStd: number | null;
  targetFps: number | null;
  bitrateKbps: number | null;
  congestion: number | null;
  avgRenderMs: number | null;
  windowSec: number;
}

export interface Diagnosis {
  id: string;
  category: 'network' | 'gpu' | 'encoder' | 'fps';
  level: Level;
  title: string;
  explanation: string;
  advice: string[];
  fixes: FixId[];
}

export interface HealthReport {
  phase: 'waiting' | 'calibrating' | 'ready';
  overall: Level;
  headline: string;
  streaming: boolean;
  metrics: Metrics;
  levels: Record<MetricKey, Level>;
  diagnoses: Diagnosis[];
}

export const EMPTY_REPORT: HealthReport = {
  phase: 'waiting',
  overall: 'ok',
  headline: 'Esperando datos de OBS…',
  streaming: false,
  metrics: {
    networkLossPct: null,
    renderLagPct: null,
    encoderLagPct: null,
    cpuAvg: null,
    fpsAvg: null,
    fpsStd: null,
    targetFps: null,
    bitrateKbps: null,
    congestion: null,
    avgRenderMs: null,
    windowSec: 0,
  },
  levels: { network: 'ok', gpu: 'ok', encoder: 'ok', cpu: 'ok', fps: 'ok' },
  diagnoses: [],
};
