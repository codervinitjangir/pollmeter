import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: ['**/*.zip', '**/node_modules/**'],
    },
    proxy: {
      // Proxy REST API calls to the Express server during dev
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Proxy Socket.io polling to the Express server during dev
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
