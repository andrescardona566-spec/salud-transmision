// Marca y créditos. Para cambiar el nombre que se muestra, edita solo este archivo.
export const BRAND = {
  name: 'Soy Cardona Live',
  product: 'Salud de transmisión',
  tagline: 'Servicio gratuito para modelos y creadores',
} as const;

// Historial de mejoras (lo más nuevo primero). Se muestra en el panel al pulsar la versión.
export const CHANGELOG: Array<{ version: string; date: string; notes: string[] }> = [
  {
    version: '1.0.0',
    date: '2026-10-22',
    notes: [
      'Primera versión: semáforo de salud, diagnóstico de red, GPU y codificador en español.',
      'Botones de arreglo rápido con confirmación y opción de deshacer.',
      'Modo demo para probar sin OBS.',
    ],
  },
];
