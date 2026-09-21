import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Security guard: Fail build immediately if API keys are mistakenly prefixed with VITE_
  const env = loadEnv(mode, process.cwd(), '');
  if (env.VITE_GEMINI_API_KEY || env.VITE_API_KEY) {
    throw new Error(
      'SECURITY FATAL: Do NOT prefix GEMINI_API_KEY with VITE_! Variables with the VITE_ prefix are bundled into the public client JavaScript.'
    );
  }

  return {
    base: './',
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
