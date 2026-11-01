import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: { '/api': 'http://127.0.0.1:4010' },
    fs: { allow: [here, repoRoot] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
