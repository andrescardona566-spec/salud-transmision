import type { Level } from '../types';

const BORDER: Record<Level, string> = { ok: 'border-l-ok', warn: 'border-l-warn', crit: 'border-l-crit' };
const VALUE: Record<Level, string> = { ok: 'text-slate-100', warn: 'text-warn', crit: 'text-crit' };

interface Props {
  label: string;
  value: string;
  hint: string;
  level: Level;
  muted?: boolean;
}

export function MetricCard({ label, value, hint, level, muted }: Props) {
  return (
    <div className={`rounded-lg border border-line border-l-4 bg-panel px-3 py-2 ${muted ? 'border-l-line' : BORDER[level]}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${muted ? 'text-slate-500' : VALUE[level]}`}>{value}</div>
      <div className="text-[11px] leading-tight text-slate-500">{hint}</div>
    </div>
  );
}
