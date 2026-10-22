/** Guía de primeros pasos que se muestra mientras el panel no está conectado a OBS. */
export function Onboarding({ onOpenSettings }: { onOpenSettings(): void }) {
  const step = 'flex gap-3';
  const num = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white';

  return (
    <section className="rounded-xl border border-sky-700/50 bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-100">Conecta el panel con OBS (solo la primera vez)</h2>
      <ol className="space-y-3 text-xs leading-relaxed text-slate-300">
        <li className={step}>
          <span className={num}>1</span>
          <span>
            En OBS abre el menú <b>Herramientas → Ajustes del servidor WebSocket</b>{' '}
            <span className="text-slate-500">(en inglés: Tools → WebSocket Server Settings)</span>.
          </span>
        </li>
        <li className={step}>
          <span className={num}>2</span>
          <span>
            Marca <b>Habilitar servidor WebSocket</b>, pulsa <b>Mostrar información de conexión</b> y{' '}
            <b>copia la contraseña</b>. Luego pulsa Aceptar.
          </span>
        </li>
        <li className={step}>
          <span className={num}>3</span>
          <span>
            Pulsa el botón de abajo, pega la contraseña y pulsa <b>Conectar</b>.
          </span>
        </li>
      </ol>
      <button
        onClick={onOpenSettings}
        className="mt-4 w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
      >
        Pegar contraseña y conectar
      </button>
      <p className="mt-3 text-[11px] leading-snug text-slate-500">
        Si ya lo configuraste antes y OBS estaba cerrado, solo ábrelo: el panel se conecta solo. ¿Quieres ver cómo se ve antes
        de conectar? Entra en ⚙ Ajustes y pulsa «Probar en modo demo».
      </p>
    </section>
  );
}
