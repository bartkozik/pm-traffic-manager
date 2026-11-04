import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  server: {
    proxy: {
      '/api': { target: process.env.PTM_DEV_API_PROXY || 'http://127.0.0.1:4000', ws: true },
    },
  },
  plugins: [
    react(),
    tsconfigPaths(),
  ],
});
