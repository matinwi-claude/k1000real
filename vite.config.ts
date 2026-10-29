import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Dev-only stand-in for the Cloudflare Pages Function at /api/status. */
function devApi(): Plugin {
  return {
    name: 'k1000-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/status', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ system: 'K1000 DIGITAL TWIN', status: 'online', edge: 'DEV', illustrative: true }));
      });
      // Cloudflare serves parts.html at /parts; mirror that in dev
      server.middlewares.use((req, _res, next) => {
        const r = req as unknown as { url?: string };
        if (r.url === '/parts' || r.url?.startsWith('/parts?')) r.url = r.url.replace('/parts', '/parts.html');
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: { main: 'index.html', parts: 'parts.html' },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('camera-controls')) return 'three';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
  server: { host: true },
});
