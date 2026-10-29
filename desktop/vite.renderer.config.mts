import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
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
});
