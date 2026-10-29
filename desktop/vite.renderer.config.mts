import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig((env) => ({
  // Forge changes dependency resolution. Keep its cache separate from a
  // standalone browser preview so concurrent servers cannot overwrite it.
  cacheDir: `node_modules/.vite/${'forgeConfigSelf' in env ? 'electron' : 'browser'}`,
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      '/api': {
        target:
          process.env.THREADMARK_API_URL?.replace(/\/api\/?$/, '') ||
          'http://127.0.0.1:8090',
        changeOrigin: true,
        configure(proxy) {
          // The browser uses this local proxy; ADK receives a server-to-server request.
          proxy.on('proxyReq', (request) => request.removeHeader('origin'));
        },
      },
    },
  },
}));
