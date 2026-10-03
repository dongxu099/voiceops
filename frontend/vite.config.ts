import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7861', changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            // Preserve same-origin validation across this local development proxy.
            if (request.headers.origin === `http://${request.headers.host}`) {
              proxyRequest.setHeader('origin', 'http://127.0.0.1:7861');
            }
          });
        },
      },
    },
  },
});
