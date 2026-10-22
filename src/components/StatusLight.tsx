import type { HealthReport, Level } from '../types';

const ACTIVE: Record<Level, string> = {
  ok: 'bg-ok shadow-[0_0_18px_2px_rgba(47,191,113,0.65)]',
  warn: 'bg-warn shadow-[0_0_18px_2px_rgba(240,180,41,0.65)]',
  crit: 'bg-crit shadow-[0_0_18px_2px_rgba(239,68,68,0.7)] animate-pulse',
};
const OFF = 'bg-line';

const LABEL: Record<Level, string> = { ok: 'NORMAL', warn: 'ADVERTENCIA', crit: 'CRÍTICO' };
const TEXT: Record<Level, string> = { ok: 'text-ok', warn: 'text-warn', crit: 'text-crit' };

/** Semáforo grande: tres luces y el titular del diagnóstico. */
export function StatusLight({ report, active }: { report: HealthReport; active: boolean }) {
  const idle = !active || report.phase !== 'ready';
  const level = report.overall;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-panel p-4">
      <div className="flex shrink-0 gap-2 rounded-full bg-ink px-3 py-2" aria-hidden="true">
        <span className={`h-5 w-5 rounded-full ${!idle && level === 'crit' ? ACTIVE.crit : OFF}`} />
        <span className={`h-5 w-5 rounded-full ${!idle && level === 'warn' ? ACTIVE.warn : OFF}`} />
        <span className={`h-5 w-5 rounded-full ${!idle && level === 'ok' ? ACTIVE.ok : OFF}`} />
      </div>
      <div className="min-w-0">
        <div className={`text-xs font-bold tracking-widest ${idle ? 'text-slate-500' : TEXT[level]}`}>
          {idle ? (active ? 'MIDIENDO' : 'SIN DATOS') : LABEL[level]}
        </div>
        <div className="text-sm font-semibold leading-snug text-slate-100">
          {active ? report.headline : 'Conecta con OBS para empezar'}
        </div>
        {active && report.phase === 'ready' && (
          <div className="mt-0.5 text-xs text-slate-500">
            Promedio de los últimos {report.metrics.windowSec} s
            {report.streaming ? ' · transmitiendo' : ' · sin transmitir'}
          </div>
        )}
      </div>
    </div>
  );
}
