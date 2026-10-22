import { useEffect, useState } from 'react';

const EVERY_MS = 5 * 60 * 1000;

/** Devuelve true cuando en internet hay una versión más nueva que la que está abierta. */
export function useUpdateCheck(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { build?: string };
        if (!stopped && data.build && data.build !== __BUILD_ID__) setAvailable(true);
      } catch {
        /* sin internet o modo desarrollo: no pasa nada */
      }
    };

    void check();
    const id = window.setInterval(() => void check(), EVERY_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  return available;
}
