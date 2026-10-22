import type OBSWebSocket from 'obs-websocket-js';
import type { FixId } from '../types';

/**
 * "Auto-Fix": cada arreglo se hace en DOS pasos para que nunca cambie nada sin avisar:
 *   1) planFix()  -> mira cómo está OBS y describe exactamente qué va a cambiar (no toca nada).
 *   2) plan.apply() -> hace el cambio (solo cuando la persona pulsa "Aplicar").
 */

export interface FixResult {
  message: string;
  undo?: () => Promise<string>;
}

export interface FixPlan {
  summary: string;
  apply(): Promise<FixResult>;
}

export type PlanResult = { ok: true; plan: FixPlan } | { ok: false; reason: string };

const unavailable = (reason: string): PlanResult => ({ ok: false, reason });

async function readParam(obs: OBSWebSocket, category: string, name: string): Promise<string | null> {
  try {
    const r = await obs.call('GetProfileParameter', { parameterCategory: category, parameterName: name });
    return r.parameterValue ?? r.defaultParameterValue ?? null;
  } catch {
    return null;
  }
}

async function writeParam(obs: OBSWebSocket, category: string, name: string, value: string): Promise<void> {
  await obs.call('SetProfileParameter', { parameterCategory: category, parameterName: name, parameterValue: value });
}

async function isStreaming(obs: OBSWebSocket): Promise<boolean> {
  try {
    return (await obs.call('GetStreamStatus')).outputActive;
  } catch {
    return false;
  }
}

/* ------------------------------ Arreglos ------------------------------ */

async function planLowerBitrate(obs: OBSWebSocket): Promise<PlanResult> {
  const mode = await readParam(obs, 'Output', 'Mode');
  if (mode !== 'Simple') {
    return unavailable(
      'Tu OBS usa el modo de salida Avanzado. Ahí el bitrate solo se puede cambiar a mano: Ajustes → Salida → Transmisión → Tasa de bits.',
    );
  }
  const current = Number(await readParam(obs, 'SimpleOutput', 'VBitrate'));
  if (!current) return unavailable('No pude leer el bitrate actual de OBS.');
  const next = Math.max(1000, Math.floor((current * 0.8) / 100) * 100);
  if (next >= current) return unavailable(`Tu bitrate (${current} kbps) ya es bajo; bajarlo más dañaría mucho la calidad.`);

  return {
    ok: true,
    plan: {
      summary: `Bajar el bitrate de video de ${current} a ${next} kbps. Se aplica la próxima vez que inicies la transmisión.`,
      apply: async () => {
        await writeParam(obs, 'SimpleOutput', 'VBitrate', String(next));
        return {
          message: `Listo: bitrate guardado en ${next} kbps. Se usará al reiniciar la transmisión.`,
          undo: async () => {
            await writeParam(obs, 'SimpleOutput', 'VBitrate', String(current));
            return `Bitrate devuelto a ${current} kbps.`;
          },
        };
      },
    },
  };
}

async function planDisableBrowserSources(obs: OBSWebSocket): Promise<PlanResult> {
  // `currentProgramSceneName` existe en todas las versiones de obs-websocket 5.x (OBS 28 en adelante).
  const sceneName = (await obs.call('GetCurrentProgramScene')).currentProgramSceneName;
  const items = await obs.call('GetSceneItemList', { sceneName });
  const targets = items.sceneItems.filter((i) => i.inputKind === 'browser_source' && i.sceneItemEnabled);
  if (targets.length === 0) {
    return unavailable('No hay fuentes de navegador activas en la escena actual; el peso viene de otra fuente (captura de juego, filtros…).');
  }
  const names = targets.map((t) => String(t.sourceName));
  return {
    ok: true,
    plan: {
      summary: `Ocultar en la escena "${sceneName}" estas fuentes de navegador: ${names.join(', ')}. Podrás deshacerlo.`,
      apply: async () => {
        for (const t of targets) {
          await obs.call('SetSceneItemEnabled', {
            sceneName: sceneName,
            sceneItemId: Number(t.sceneItemId),
            sceneItemEnabled: false,
          });
        }
        return {
          message: `Ocultadas ${targets.length} fuente(s): ${names.join(', ')}.`,
          undo: async () => {
            for (const t of targets) {
              await obs.call('SetSceneItemEnabled', {
                sceneName: sceneName,
                sceneItemId: Number(t.sceneItemId),
                sceneItemEnabled: true,
              });
            }
            return 'Fuentes de navegador activadas otra vez.';
          },
        };
      },
    },
  };
}

const X264_PRESETS = ['slower', 'slow', 'medium', 'fast', 'faster', 'veryfast', 'superfast', 'ultrafast'];

async function planFasterPreset(obs: OBSWebSocket): Promise<PlanResult> {
  const mode = await readParam(obs, 'Output', 'Mode');
  if (mode !== 'Simple') {
    return unavailable('Tu OBS usa el modo de salida Avanzado: cambia el preset a mano en Ajustes → Salida → Transmisión.');
  }
  const encoder = (await readParam(obs, 'SimpleOutput', 'StreamEncoder')) ?? '';
  if (!encoder.toLowerCase().includes('x264')) {
    return unavailable(
      `Tu codificador (${encoder || 'desconocido'}) no es x264, así que el preset no es el problema. Prueba bajar la resolución o los FPS.`,
    );
  }
  const current = (await readParam(obs, 'SimpleOutput', 'Preset')) ?? '';
  const idx = X264_PRESETS.indexOf(current);
  if (idx === -1) return unavailable('No pude leer el preset actual de x264.');
  const floor = X264_PRESETS.indexOf('superfast');
  if (idx >= floor) return unavailable(`Ya usas el preset "${current}", que es de los más rápidos. Baja la resolución o usa un codificador por hardware (NVENC/AMF).`);
  const next = X264_PRESETS[Math.min(idx + 1, floor)];
  return {
    ok: true,
    plan: {
      summary: `Cambiar el preset de x264 de "${current}" a "${next}" (menos carga de CPU, algo menos de calidad). Se aplica al reiniciar la transmisión.`,
      apply: async () => {
        await writeParam(obs, 'SimpleOutput', 'Preset', next);
        return {
          message: `Preset cambiado a "${next}". Se usará al reiniciar la transmisión.`,
          undo: async () => {
            await writeParam(obs, 'SimpleOutput', 'Preset', current);
            return `Preset devuelto a "${current}".`;
          },
        };
      },
    },
  };
}

async function planLowerResolution(obs: OBSWebSocket): Promise<PlanResult> {
  if (await isStreaming(obs)) {
    return unavailable('OBS no permite cambiar la resolución mientras transmites. Hazlo al terminar (Ajustes → Video → Resolución de salida).');
  }
  const v = await obs.call('GetVideoSettings');
  if (v.outputHeight <= 720) return unavailable(`Tu salida ya es ${v.outputWidth}×${v.outputHeight}; no hay más que bajar.`);
  const newH = 720;
  const newW = Math.round((v.outputWidth * newH) / v.outputHeight / 2) * 2;
  return {
    ok: true,
    plan: {
      summary: `Bajar la resolución de salida de ${v.outputWidth}×${v.outputHeight} a ${newW}×${newH}.`,
      apply: async () => {
        await obs.call('SetVideoSettings', { outputWidth: newW, outputHeight: newH });
        return {
          message: `Resolución de salida cambiada a ${newW}×${newH}.`,
          undo: async () => {
            await obs.call('SetVideoSettings', { outputWidth: v.outputWidth, outputHeight: v.outputHeight });
            return `Resolución devuelta a ${v.outputWidth}×${v.outputHeight}.`;
          },
        };
      },
    },
  };
}

export async function planFix(obs: OBSWebSocket, id: FixId): Promise<PlanResult> {
  try {
    switch (id) {
      case 'lower-bitrate':
        return await planLowerBitrate(obs);
      case 'disable-browser-sources':
        return await planDisableBrowserSources(obs);
      case 'faster-preset':
        return await planFasterPreset(obs);
      case 'lower-resolution':
        return await planLowerResolution(obs);
    }
  } catch (e) {
    return unavailable(`OBS no respondió como esperaba: ${e instanceof Error ? e.message : String(e)}`);
  }
}
