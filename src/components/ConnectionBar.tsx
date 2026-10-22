import { useState, type FormEvent } from 'react';
import { DEFAULT_CONFIG, loadConfig, type ConnStatus, type ObsConfig } from '../services/obsService';

const DOT: Record<ConnStatus, string> = {
  connected: 'bg-ok',
  connecting: 'bg-warn animate-pulse',
  reconnecting: 'bg-warn animate-pulse',
  disconnected: 'bg-slate-500',
  error: 'bg-crit',
};

interface Props {
  status: ConnStatus;
  message: string;
  demo: boolean;
  open: boolean;
  onToggle(): void;
  onConnect(cfg: ObsConfig): void;
  onDisconnect(): void;
  onDemo(): void;
  onStopDemo(): void;
}

export function ConnectionBar({ status, message, demo, open, onToggle, onConnect, onDisconnect, onDemo, onStopDemo }: Props) {
  const saved = loadConfig() ?? DEFAULT_CONFIG;
  const [host, setHost] = useState(saved.host);
  const [port, setPort] = useState(String(saved.port));
  const [password, setPassword] = useState(saved.password);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onConnect({ host: host.trim() || DEFAULT_CONFIG.host, port: Number(port) || DEFAULT_CONFIG.port, password });
    onToggle();
  };

  const input = 'w-full rounded-md border border-line bg-ink px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500';

  return (
    <header className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[status]}`} />
          <span className="truncate text-xs text-slate-300">{message || 'Sin conexión'}</span>
        </div>
        <button onClick={onToggle} className="shrink-0 rounded-md bg-line px-2 py-1 text-xs text-slate-200 hover:bg-slate-600">
          {open ? 'Cerrar' : '⚙ Ajustes'}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="space-y-2 border-t border-line p-3">
          <p className="text-[11px] leading-snug text-slate-400">
            En OBS: Herramientas → Ajustes del servidor WebSocket → activar y copiar la contraseña. El puerto normal es 4455.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 text-[11px] text-slate-400">
              Dirección
              <input className={input} value={host} onChange={(e) => setHost(e.target.value)} />
            </label>
            <label className="text-[11px] text-slate-400">
              Puerto
              <input className={input} inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} />
            </label>
          </div>
          <label className="block text-[11px] text-slate-400">
            Contraseña (déjala vacía si OBS no pide una)
            <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </label>
          <p className="text-[10px] text-slate-500">La contraseña se guarda solo dentro de este panel de OBS, en tu PC.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">
              Conectar
            </button>
            {status === 'connected' && !demo && (
              <button type="button" onClick={onDisconnect} className="rounded-md bg-line px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600">
                Desconectar
              </button>
            )}
            {demo ? (
              <button type="button" onClick={onStopDemo} className="rounded-md bg-line px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600">
                Salir del modo demo
              </button>
            ) : (
              <button type="button" onClick={() => { onDemo(); onToggle(); }} className="rounded-md bg-line px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600">
                Probar en modo demo
              </button>
            )}
          </div>
        </form>
      )}
    </header>
  );
}
