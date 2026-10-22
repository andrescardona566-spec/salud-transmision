import { useState } from 'react';
import { FIX_LABELS, type Diagnosis, type FixId } from '../types';
import type { FixPlan, PlanResult } from '../services/obsFixes';

const STYLE = {
  warn: { border: 'border-warn/50', badge: 'bg-warn/15 text-warn', tag: 'ADVERTENCIA' },
  crit: { border: 'border-crit/60', badge: 'bg-crit/15 text-crit', tag: 'CRÍTICO' },
  ok: { border: 'border-ok/40', badge: 'bg-ok/15 text-ok', tag: 'NORMAL' },
} as const;

type FixState =
  | { step: 'idle' }
  | { step: 'planning' }
  | { step: 'confirm'; plan: FixPlan }
  | { step: 'applying' }
  | { step: 'done'; message: string; undo?: () => Promise<string> }
  | { step: 'unavailable'; reason: string }
  | { step: 'error'; message: string };

/** Botón "Auto-Fix" en dos pasos: primero muestra qué va a cambiar, después aplica. */
function FixButton({ id, planFix }: { id: FixId; planFix: (id: FixId) => Promise<PlanResult> }) {
  const [state, setState] = useState<FixState>({ step: 'idle' });

  const start = async () => {
    setState({ step: 'planning' });
    const r = await planFix(id);
    setState(r.ok ? { step: 'confirm', plan: r.plan } : { step: 'unavailable', reason: r.reason });
  };

  const apply = async (plan: FixPlan) => {
    setState({ step: 'applying' });
    try {
      const r = await plan.apply();
      setState({ step: 'done', message: r.message, undo: r.undo });
    } catch (e) {
      setState({ step: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const undo = async (fn: () => Promise<string>) => {
    try {
      setState({ step: 'done', message: await fn() });
    } catch (e) {
      setState({ step: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const base = 'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50';

  switch (state.step) {
    case 'idle':
      return (
        <button className={`${base} bg-sky-600 text-white hover:bg-sky-500`} onClick={start}>
          ⚡ {FIX_LABELS[id]}
        </button>
      );
    case 'planning':
    case 'applying':
      return <span className="text-xs text-slate-400">{state.step === 'planning' ? 'Revisando OBS…' : 'Aplicando…'}</span>;
    case 'confirm':
      return (
        <div className="w-full rounded-md bg-ink p-2 text-xs text-slate-300">
          <p className="mb-2">{state.plan.summary}</p>
          <div className="flex gap-2">
            <button className={`${base} bg-ok text-ink hover:brightness-110`} onClick={() => apply(state.plan)}>
              Aplicar
            </button>
            <button className={`${base} bg-line text-slate-200 hover:bg-slate-600`} onClick={() => setState({ step: 'idle' })}>
              Cancelar
            </button>
          </div>
        </div>
      );
    case 'done':
      return (
        <div className="w-full rounded-md bg-ok/10 p-2 text-xs text-ok">
          <p>✓ {state.message}</p>
          {state.undo && (
            <button className="mt-1 underline" onClick={() => undo(state.undo!)}>
              Deshacer
            </button>
          )}
        </div>
      );
    case 'unavailable':
      return (
        <div className="w-full rounded-md bg-ink p-2 text-xs text-slate-400">
          <p>{FIX_LABELS[id]}: {state.reason}</p>
          <button className="mt-1 underline" onClick={() => setState({ step: 'idle' })}>
            Cerrar
          </button>
        </div>
      );
    case 'error':
      return (
        <div className="w-full rounded-md bg-crit/10 p-2 text-xs text-crit">
          <p>No se pudo aplicar: {state.message}</p>
          <button className="mt-1 underline" onClick={() => setState({ step: 'idle' })}>
            Cerrar
          </button>
        </div>
      );
  }
}

export function AdviceCard({ d, planFix }: { d: Diagnosis; planFix: (id: FixId) => Promise<PlanResult> }) {
  const s = STYLE[d.level];
  return (
    <article className={`rounded-xl border ${s.border} bg-panel p-3`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-slate-100">{d.title}</h3>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${s.badge}`}>{s.tag}</span>
      </div>
      <p className="text-xs leading-relaxed text-slate-300">{d.explanation}</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-400">
        {d.advice.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {d.fixes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-line pt-3">
          {d.fixes.map((id) => (
            <FixButton key={id} id={id} planFix={planFix} />
          ))}
        </div>
      )}
    </article>
  );
}
