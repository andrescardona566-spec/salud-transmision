# Dock de salud de transmisión para OBS Studio

Un panel que vive dentro de OBS, vigila tu transmisión cada segundo y te dice **en español claro**
si el problema es tu **internet**, tu **tarjeta gráfica** o el **codificador**, con consejos y botones de arreglo rápido.

> **Versión 1.0.0 · desarrollado por Soy Cardona Live.**
> La forma recomendada de usarlo es **publicarlo una vez en internet (GitHub Pages)** para que cualquier modelo solo pegue un enlace en OBS
> y reciba las actualizaciones solas. Eso se explica en `GUIA-PUBLICAR-Y-ACTUALIZAR.html`.
> Lo que sigue en este archivo es la opción **local** (en tu PC) y la parte técnica.

---

## 1. Puesta en marcha en Windows (paso a paso)

### Una sola vez

1. **Instala Node.js** (la versión "LTS") desde <https://nodejs.org>. Acepta todo por defecto y reinicia el PC.
2. **Activa el servidor WebSocket en OBS** (OBS 28 o superior ya lo trae):
   - Menú **Herramientas → Ajustes del servidor WebSocket**.
   - Marca **Habilitar servidor WebSocket**.
   - Deja el puerto en **4455**.
   - Deja marcada la autenticación y pulsa **Mostrar información de conexión** para ver (y copiar) la **contraseña**.
   - Pulsa **Aceptar**.
3. **Descomprime** esta carpeta donde quieras, por ejemplo `C:\obs-health-dock`.

### Cada vez que vayas a transmitir

1. Haz **doble clic en `start-dock.bat`**.
   - La primera vez tarda unos minutos (descarga e instala lo necesario). Las siguientes veces abre al instante.
   - Cuando veas el mensaje `Panel listo en: http://127.0.0.1:4173`, **deja esa ventana abierta**.
2. **Ancla el panel en OBS**:
   - Menú **Docks → Paneles personalizados para navegador**.
   - **Nombre del panel:** `Salud de transmisión`
   - **URL:** `http://127.0.0.1:4173`
   - Pulsa **Aplicar** y luego **Cerrar**.
3. El panel aparece como un dock. Arrástralo al lado o abajo, como cualquier otro. OBS recuerda su posición.
4. En el panel pulsa **⚙ Ajustes**, escribe la **contraseña** de OBS y pulsa **Conectar**.
   Se guarda: la próxima vez conecta solo.

> **¿Quieres solo verlo funcionando antes de transmitir?** En ⚙ Ajustes pulsa **Probar en modo demo**.
> Simula problemas de red, GPU y codificador sin tocar OBS.

> **Para que el panel arranque solo con Windows:** pulsa `Win + R`, escribe `shell:startup`, y pega ahí un
> acceso directo a `start-dock.bat`.

### Si algo no funciona

| Qué ves | Qué hacer |
|---|---|
| El dock sale en blanco en OBS | La ventana negra de `start-dock.bat` está cerrada. Ábrela otra vez y recarga el dock. |
| "No encuentro OBS. Reintentando…" | OBS está cerrado o el servidor WebSocket está apagado (paso 2 de «Una sola vez»). Se reconecta solo. |
| "La contraseña de OBS es incorrecta" | Copia de nuevo la contraseña desde OBS y pégala en ⚙ Ajustes. |
| `start-dock.bat` dice que `npm` no existe | Falta instalar Node.js (paso 1), o reiniciar el PC después de instalarlo. |

---

## 2. Cómo funciona

```
OBS Studio ──(WebSocket v5, 127.0.0.1:4455)──► ObsService ──► HealthEngine ──► Interfaz React
                                                 │  muestrea cada 1 s            │ ventana de 20 s      semáforo, métricas,
                                                 │  GetStats + GetStreamStatus   │ 3 niveles            tarjetas de consejos
                                                 │  StreamStateChanged           │ anti-parpadeo        botones Auto-Fix
                                                 └─ reconexión automática        └─ textos en español         │
                                                                                                             ▼
                                                                   obsFixes.ts (plan → confirmar → aplicar → deshacer)
```

### Estructura de carpetas

```
obs-health-dock/
├─ start-dock.bat              ← opción local: doble clic en Windows
├─ .github/workflows/deploy.yml ← publica el panel en internet automáticamente
├─ src/brand.ts (créditos y lista de novedades; se edita en cada mejora)
├─ package.json, vite.config.ts, tailwind.config.js, tsconfig.json
├─ index.html
└─ src/
   ├─ main.tsx, App.tsx, index.css, vite-env.d.ts
   ├─ types.ts                 ← tipos compartidos (Sample, HealthReport, FixId…)
   ├─ services/
   │  ├─ obsService.ts         ← conexión, reconexión, persistencia, muestreo
   │  ├─ obsFixes.ts           ← "Auto-Fix": 4 arreglos en dos pasos con deshacer
   │  └─ demoSource.ts         ← datos simulados para probar sin OBS
   ├─ engine/
   │  └─ healthEngine.ts       ← ventana deslizante + matriz de decisiones
   ├─ hooks/
   │  └─ useObsHealth.ts       ← une servicio + motor + estado de React
   └─ components/
      ├─ StatusLight.tsx       ← semáforo
      ├─ MetricCard.tsx        ← tarjetas de métricas
      ├─ AdviceCard.tsx        ← diagnóstico + consejos + botones Auto-Fix
      └─ ConnectionBar.tsx     ← estado de conexión y ajustes
```

### Qué mide cada cosa (importante)

obs-websocket usa el **mismo nombre** (`outputSkippedFrames`) en dos peticiones distintas, con significados distintos:

| Problema | De dónde sale | Qué significa |
|---|---|---|
| **Red** | `GetStreamStatus.outputSkippedFrames` / `outputTotalFrames` y `outputCongestion` | Cuadros que OBS descartó porque la red no los dejó salir |
| **GPU** | `GetStats.renderSkippedFrames` / `renderTotalFrames` y `averageFrameRenderTime` | Cuadros que OBS no alcanzó a renderizar |
| **Codificador** | `GetStats.outputSkippedFrames` / `outputTotalFrames` y `cpuUsage` | Cuadros saltados por retraso del codificador |
| **FPS** | `GetStats.activeFps` frente al objetivo de `GetVideoSettings` | Estabilidad de los cuadros por segundo |
| **Bitrate** | Diferencia de `GetStreamStatus.outputBytes` entre muestras | Lo que realmente se está enviando |

> En el protocolo, el campo de renderizado se llama `renderSkippedFrames` (no `renderMissedFrames`).
> **Conviene verificarlo en tu OBS:** compara las cifras del panel con las de *Ver → Estadísticas*
> («Cuadros omitidos por retraso de renderizado / de codificación» y «Cuadros perdidos»).

### Matriz de decisiones (en `healthEngine.ts → DEFAULT_THRESHOLDS`)

Todo se calcula sobre una **ventana deslizante de 20 s** (no opina hasta tener 8 s de datos).

| Señal | Normal | Advertencia | Crítico |
|---|---|---|---|
| Red: % de cuadros perdidos | < 0,5 % | ≥ 0,5 % | ≥ 1,5 % |
| Red: congestión de OBS | < 25 % | ≥ 25 % | ≥ 60 % (o OBS reconectando) |
| GPU: % de cuadros sin renderizar | < 0,5 % | ≥ 0,5 % | ≥ 1,0 % |
| GPU: tiempo de render por cuadro | < 80 % del tiempo de cuadro | ≥ 80 % | ≥ 100 % |
| Codificador: % de cuadros saltados | < 0,5 % | ≥ 0,5 % | ≥ 1,0 % |
| CPU de OBS | < 85 % | ≥ 85 % (advertencia de codificador) | — |
| FPS reales / objetivo | ≥ 97 % | < 97 % | < 90 % |

- **Anti-parpadeo:** un nivel sube al instante, pero solo baja tras 3 s seguidos tranquilos.
- **Los FPS bajos solo se avisan si red, GPU y codificador están bien** (si no, son consecuencia de ellos).
- Para cambiar la sensibilidad, edita `DEFAULT_THRESHOLDS`.

### Auto-Fix (dos pasos, siempre con confirmación)

El botón primero **revisa OBS y te muestra exactamente qué va a cambiar**; solo cambia algo si pulsas **Aplicar**, y deja **Deshacer**.

| Botón | Qué hace | Límites |
|---|---|---|
| Bajar bitrate 20 % | `SetProfileParameter` → `SimpleOutput/VBitrate` | Solo modo de salida **Simple**. Se aplica al **reiniciar** la transmisión. |
| Apagar fuentes de navegador | `SetSceneItemEnabled` en la escena actual | Solo fuentes de navegador de primer nivel (no dentro de grupos). |
| Usar un preset más rápido | `SetProfileParameter` → `SimpleOutput/Preset` | Solo modo **Simple** con **x264**. Se aplica al reiniciar la transmisión. |
| Bajar la salida a 720p | `SetVideoSettings` | OBS **no lo permite mientras transmites**; el panel te lo explica. |

En los casos que no se pueden automatizar, el panel te dice dónde cambiarlo a mano.

---

## 3. Para desarrolladores

```bash
npm install
npm run dev         # http://127.0.0.1:5173 con recarga en vivo
npm run build       # genera dist/
npm run preview     # sirve dist/ en http://127.0.0.1:4173 (lo que usa start-dock.bat)
npm run typecheck   # comprobación de tipos de TypeScript
```

- El dock **debe servirse por HTTP** (no abrir `dist/index.html` con `file://`: Chromium bloquea los módulos ES desde archivos locales).
- Stack: Vite 5 · React 18 · Tailwind 3 · obs-websocket-js 5 · TypeScript estricto.
- Siguientes pasos naturales: gráfica histórica (sparklines), alertas sonoras, detección del codificador en modo Avanzado, perfiles de umbrales por plataforma.
