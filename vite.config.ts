import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// Identifica esta compilación. El panel compara este valor con el de version.json
// publicado en internet: si son distintos, avisa que hay una actualización.
const buildId = new Date().toISOString();

const versionFile = (): Plugin => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: pkg.version, build: buildId }),
    });
  },
});

// base './' = rutas relativas: funciona igual en GitHub Pages (que usa una subcarpeta) y en local.
// El navegador integrado de OBS (CEF) es un Chromium algo antiguo: compilamos para chrome100.
export default defineConfig({
  base: './',
  plugins: [react(), versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  build: { target: 'chrome100' },
});
