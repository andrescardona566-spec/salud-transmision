import OBSWebSocket from 'obs-websocket-js';
import type { Sample } from '../types';

export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ObsConfig {
  host: string;
  port: number;
  password: string;
}

export const DEFAULT_CONFIG: ObsConfig = { host: '127.0.0.1', port: 4455, password: '' };

const STORAGE_KEY = 'obs-health-dock:config';
const POLL_MS = 1000;
const AUTH_FAILED = 4009; // código de cierre de obs-websocket cuando la contraseña es incorrecta

/* ---------------- Persistencia de puerto y contraseña ---------------- */

export function loadConfig(): ObsConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ObsConfig>;
    if (typeof p.host !== 'string' || typeof p.port !== 'number') return null;
    return { host: p.host, port: p.port, password: typeof p.password === 'string' ? p.password : '' };
  } catch {
    return null;
  }
}

export function saveConfig(cfg: ObsConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* si el almacenamiento falla, el dock sigue funcionando sin recordar la contraseña */
  }
}

/* ------------------------------ Servicio ------------------------------ */

export interface ObsServiceHandlers {
  onStatus(status: ConnStatus, message: string): void;
  onSample(sample: Sample): void;
  onStreamStateChanged(active: boolean): void;
}

/**
 * Se encarga de TODO lo que habla con OBS:
 *  - conexión / reconexión automática con espera creciente (1, 2, 4, 8 y 10 s),
 *  - muestreo cada segundo con GetStats + GetStreamStatus,
 *  - evento StreamStateChanged para reiniciar el análisis al empezar/terminar la transmisión.
 */
export class ObsService {
  readonly client = new OBSWebSocket();

  private cfg: ObsConfig | null = null;
  private wantConnected = false;
  private attempt = 0;
  private retryTimer: number | undefined;
  private pollTimer: number | undefined;
  private polling = false;
  private lastBytes: { bytes: number; t: number } | null = null;
  private targetFps = 30;

  constructor(private readonly h: ObsServiceHandlers) {
    this.client.on('ConnectionClosed', (err) => this.onClosed(err.code));
    this.client.on('StreamStateChanged', (e) => {
      this.lastBytes = null;
      void this.refreshVideoInfo();
      this.h.onStreamStateChanged(e.outputActive);
    });
  }

  /** Conecta (o reconecta con nuevos datos). */
  async connect(cfg: ObsConfig): Promise<void> {
    await this.teardown();
    this.cfg = cfg;
    this.wantConnected = true;
    this.attempt = 0;
    saveConfig(cfg);
    await this.tryConnect();
  }

  async disconnect(): Promise<void> {
    await this.teardown();
    this.h.onStatus('disconnected', 'Desconectado');
  }

  dispose(): void {
    this.wantConnected = false;
    this.stopPolling();
    this.clearRetry();
    this.client.removeAllListeners();
    void this.client.disconnect().catch(() => undefined);
  }

  /* ----------------------------- internos ----------------------------- */

  private async teardown(): Promise<void> {
    this.wantConnected = false;
    this.stopPolling();
    this.clearRetry();
    this.lastBytes = null;
    try {
      await this.client.disconnect();
    } catch {
      /* ya estaba desconectado */
    }
  }

  private async tryConnect(): Promise<void> {
    if (!this.cfg || !this.wantConnected) return;
    const { host, port, password } = this.cfg;
    this.h.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting', 'Conectando con OBS…');
    try {
      await this.client.connect(`ws://${host}:${port}`, password || undefined, { rpcVersion: 1 });
      this.attempt = 0;
      await this.refreshVideoInfo();
      this.h.onStatus('connected', 'Conectado a OBS');
      this.startPolling();
    } catch (e) {
      const code = (e as { code?: number } | null)?.code;
      this.stopPolling();
      if (code === AUTH_FAILED) {
        this.wantConnected = false;
        this.h.onStatus('error', 'La contraseña de OBS es incorrecta.');
        return;
      }
      this.scheduleRetry();
    }
  }

  private onClosed(code: number): void {
    this.stopPolling();
    this.lastBytes = null;
    if (!this.wantConnected) return;
    if (code === AUTH_FAILED) {
      this.wantConnected = false;
      this.h.onStatus('error', 'La contraseña de OBS es incorrecta.');
      return;
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (!this.wantConnected || this.retryTimer !== undefined) return;
    const delay = Math.min(10_000, 1000 * 2 ** Math.min(this.attempt, 4));
    this.attempt++;
    this.h.onStatus('reconnecting', `No encuentro OBS. Reintentando en ${Math.round(delay / 1000)} s…`);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined;
      void this.tryConnect();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== undefined) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => void this.poll(), POLL_MS);
    void this.poll();
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.polling = false;
  }

  private async refreshVideoInfo(): Promise<void> {
    try {
      const v = await this.client.call('GetVideoSettings');
      if (v.fpsDenominator > 0) this.targetFps = v.fpsNumerator / v.fpsDenominator;
    } catch {
      /* se conserva el último valor conocido */
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return; // nunca solapar dos muestreos
    this.polling = true;
    try {
      const [stats, stream] = await Promise.all([
        this.client.call('GetStats'),
        this.client.call('GetStreamStatus'),
      ]);
      const now = Date.now();

      // Bitrate real = bytes enviados entre dos muestras. (bytes*8 bits / ms = kbit/s)
      let bitrateKbps: number | null = null;
      if (stream.outputActive) {
        if (this.lastBytes && stream.outputBytes >= this.lastBytes.bytes && now > this.lastBytes.t) {
          bitrateKbps = ((stream.outputBytes - this.lastBytes.bytes) * 8) / (now - this.lastBytes.t);
        }
        this.lastBytes = { bytes: stream.outputBytes, t: now };
      } else {
        this.lastBytes = null;
      }

      this.h.onSample({
        t: now,
        streaming: stream.outputActive,
        reconnecting: stream.outputReconnecting,
        targetFps: this.targetFps,
        activeFps: stats.activeFps,
        cpuUsage: stats.cpuUsage,
        avgRenderMs: stats.averageFrameRenderTime,
        renderSkipped: stats.renderSkippedFrames,
        renderTotal: stats.renderTotalFrames,
        encSkipped: stats.outputSkippedFrames,
        encTotal: stats.outputTotalFrames,
        netDropped: stream.outputSkippedFrames,
        netTotal: stream.outputTotalFrames,
        congestion: stream.outputCongestion,
        bitrateKbps,
      });
    } catch {
      /* si OBS se cerró, 'ConnectionClosed' dispara la reconexión; aquí no hay nada que hacer */
    } finally {
      this.polling = false;
    }
  }
}
