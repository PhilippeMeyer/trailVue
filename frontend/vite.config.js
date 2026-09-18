import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // The app is served from a sub-path by Apache (Alias /trailVue). This is the
  // equivalent of CRA's "homepage" field.
  base: '/trailVue/',

  build: {
    // deploy.sh rsyncs ./frontend/build, so keep CRA's output directory
    // rather than Vite's default "dist".
    outDir: 'build',
    sourcemap: true,
  },

  server: {
    // Mirrors CRA's "proxy" field, so the dev server can reach the API
    // without CORS.
    proxy: {
      '/api': 'http://localhost:5000',
      '/trailVue/gpx': 'http://localhost:5000',
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
    css: true,
  },
});
