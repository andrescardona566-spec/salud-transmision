import { useState } from 'react';
import { AdviceCard } from './components/AdviceCard';
import { ConnectionBar } from './components/ConnectionBar';
import { MetricCard } from './components/MetricCard';
import { Onboarding } from './components/Onboarding';
import { StatusLight } from './components/StatusLight';
import { BRAND, CHANGELOG } from './brand';
import { useObsHealth } from './hooks/useObsHealth';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import { loadConfig } from './services/obsService';

const pct = (v: number | null, digits = 2) => (v === null ? '—' : `${v.toFixed(digits).replace('.', ',')} %`);

export default function App() {
  const obs = useObsHealth();
  const updateAvailable = useUpdateCheck();
  const [settingsOpen, setSettingsOpen] = useState(() => loadConfig() === null);
  const [showNews, setShowNews] = useState(false);

  const { report } = obs;
  const m = report.metrics;
  const live = obs.status === 'connected';
  const ready = live && report.phase === 'ready';
  const streaming = report.streaming;

  const kbps = m.bitrateKbps;
  const fpsTxt = m.fpsAvg === null ? '—' : m.fpsAvg.toFixed(1).replace('.', ',');

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h1 className="text-sm font-bold text-slate-100">{BRAND.product}</h1>
        <span className="text-[11px] text-slate-500">
          por <span className="font-semibold text-sky-400">{BRAND.name}</span>
        </span>
      </div>

      {updateAvailable && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-sky-600/60 bg-sky-600/10 px-3 py-2 text-xs text-sky-200">
          <span>Hay una versión nueva del panel.</span>
          <button
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500"
          >
            Actualizar ahora
          </button>
        </div>
      )}

      <ConnectionBar
        status={obs.status}
        message={obs.statusMessage}
        demo={obs.demo}
        open={settingsOpen}
        onToggle={() => setSettingsOpen((v) => !v)}
        onConnect={obs.connect}
        onDisconnect={obs.disconnect}
        onDemo={obs.startDemo}
        onStopDemo={obs.stopDemo}
      />

      <StatusLight report={report} active={live} />

      {!live && !settingsOpen && <Onboarding onOpenSettings={() => setSettingsOpen(true)} />}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricCard
          label="Red (envío)"
          value={ready && streaming ? pct(m.networkLossPct) : '—'}
          hint="Cuadros perdidos · sano < 0,5 %"
          level={report.levels.network}
          muted={!ready || !streaming}
        />
        <MetricCard
          label="GPU (render)"
          value={ready ? pct(m.renderLagPct) : '—'}
          hint="Cuadros sin dibujar · sano < 0,5 %"
          level={report.levels.gpu}
          muted={!ready}
        />
        <MetricCard
          label="Codificador"
          value={ready ? pct(m.encoderLagPct) : '—'}
          hint="Cuadros saltados · sano < 0,5 %"
          level={report.levels.encoder}
          muted={!ready}
        />
        <MetricCard
          label="CPU de OBS"
          value={ready && m.cpuAvg !== null ? `${Math.round(m.cpuAvg)} %` : '—'}
          hint="Atención desde 85 %"
          level={report.levels.cpu}
          muted={!ready}
        />
        <MetricCard
          label="FPS"
          value={ready ? fpsTxt : '—'}
          hint={m.targetFps ? `Objetivo ${Math.round(m.targetFps)}${m.fpsStd !== null ? ` · ±${m.fpsStd.toFixed(1).replace('.', ',')}` : ''}` : 'Objetivo —'}
          level={report.levels.fps}
          muted={!ready}
        />
        <MetricCard
          label="Bitrate"
          value={ready && streaming && kbps !== null ? `${Math.round(kbps)} kbps` : '—'}
          hint={m.congestion !== null ? `Congestión ${Math.round(m.congestion * 100)} %` : 'Sin transmitir'}
          level="ok"
          muted={!ready || !streaming}
        />
      </section>

      <section className="flex flex-col gap-2" aria-live="polite">
        {ready && report.diagnoses.length === 0 && (
          <div className="rounded-xl border border-ok/40 bg-panel p-3 text-xs leading-relaxed text-slate-300">
            <span className="font-semibold text-ok">Todo en orden.</span> No se detecta ningún cuello de botella en red, GPU ni
            codificador. Este panel te avisará en cuanto algo empiece a fallar.
          </div>
        )}
        {ready && report.diagnoses.map((d) => <AdviceCard key={d.id} d={d} planFix={obs.planFix} />)}
      </section>

      <footer className="mt-auto pt-3 text-center text-[11px] leading-relaxed text-slate-600">
        <div>
          {BRAND.product} · desarrollado por <span className="font-semibold text-slate-400">{BRAND.name}</span>
        </div>
        <div>
          {BRAND.tagline} ·{' '}
          <button className="underline hover:text-slate-400" onClick={() => setShowNews((v) => !v)}>
            versión {__APP_VERSION__}
          </button>
        </div>
        {showNews && (
          <div className="mx-auto mt-2 max-w-md rounded-lg border border-line bg-panel p-3 text-left text-slate-400">
            <div className="mb-1 font-semibold text-slate-300">Novedades</div>
            {CHANGELOG.map((c) => (
              <div key={c.version} className="mb-2 last:mb-0">
                <div className="text-slate-300">
                  v{c.version} <span className="text-slate-600">· {c.date}</span>
                </div>
                <ul className="list-disc pl-4">
                  {c.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </footer>
    </main>
  );
}
