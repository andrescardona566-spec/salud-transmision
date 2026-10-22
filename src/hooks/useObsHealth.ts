import { useCallback, useEffect, useRef, useState } from 'react';
import { HealthEngine } from '../engine/healthEngine';
import { DemoSource, demoPlanFix } from '../services/demoSource';
import { planFix, type PlanResult } from '../services/obsFixes';
import { loadConfig, ObsService, type ConnStatus, type ObsConfig } from '../services/obsService';
import { EMPTY_REPORT, type FixId, type HealthReport, type Sample } from '../types';

export interface ObsHealth {
  status: ConnStatus;
  statusMessage: string;
  demo: boolean;
  report: HealthReport;
  sample: Sample | null;
  connect(cfg: ObsConfig): void;
  disconnect(): void;
  startDemo(): void;
  stopDemo(): void;
  planFix(id: FixId): Promise<PlanResult>;
}

/** Une servicio de OBS + motor de diagnóstico + estado de React. */
export function useObsHealth(): ObsHealth {
  const [status, setStatus] = useState<ConnStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState('');
  const [demo, setDemo] = useState(false);
  const [report, setReport] = useState<HealthReport>(EMPTY_REPORT);
  const [sample, setSample] = useState<Sample | null>(null);

  const [engine] = useState(() => new HealthEngine());
  const serviceRef = useRef<ObsService | null>(null);
  const demoRef = useRef<DemoSource | null>(null);

  const ingest = useCallback(
    (s: Sample) => {
      setSample(s);
      setReport(engine.push(s));
    },
    [engine],
  );

  useEffect(() => {
    const svc = new ObsService({
      onStatus: (st, msg) => {
        if (demoRef.current) return; // en modo demo se ignora el estado real de OBS
        setStatus(st);
        setStatusMessage(msg);
        if (st !== 'connected') {
          engine.reset();
          setReport(EMPTY_REPORT);
          setSample(null);
        }
      },
      onSample: (s) => {
        if (!demoRef.current) ingest(s);
      },
      onStreamStateChanged: () => engine.reset(),
    });
    serviceRef.current = svc;

    const saved = loadConfig();
    if (saved) void svc.connect(saved);

    return () => {
      demoRef.current?.stop();
      svc.dispose();
      serviceRef.current = null;
    };
  }, [engine, ingest]);

  const connect = useCallback(
    (cfg: ObsConfig) => {
      demoRef.current?.stop();
      demoRef.current = null;
      setDemo(false);
      engine.reset();
      setReport(EMPTY_REPORT);
      void serviceRef.current?.connect(cfg);
    },
    [engine],
  );

  const disconnect = useCallback(() => {
    demoRef.current?.stop();
    demoRef.current = null;
    setDemo(false);
    void serviceRef.current?.disconnect();
  }, []);

  const startDemo = useCallback(() => {
    void serviceRef.current?.disconnect();
    engine.reset();
    const d = new DemoSource(ingest);
    demoRef.current = d;
    setDemo(true);
    setStatus('connected');
    setStatusMessage('Modo demo: datos simulados, OBS no se toca');
    d.start();
  }, [engine, ingest]);

  const stopDemo = useCallback(() => {
    demoRef.current?.stop();
    demoRef.current = null;
    setDemo(false);
    setStatus('disconnected');
    setStatusMessage('');
    engine.reset();
    setReport(EMPTY_REPORT);
    setSample(null);
  }, [engine]);

  const plan = useCallback(
    async (id: FixId): Promise<PlanResult> => {
      if (demoRef.current) return demoPlanFix(id);
      const svc = serviceRef.current;
      if (!svc || status !== 'connected') return { ok: false, reason: 'No hay conexión con OBS en este momento.' };
      return planFix(svc.client, id);
    },
    [status],
  );

  return { status, statusMessage, demo, report, sample, connect, disconnect, startDemo, stopDemo, planFix: plan };
}
