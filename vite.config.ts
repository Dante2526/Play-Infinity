// Tailwind v3 handled by PostCSS
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';

export default defineConfig(() => {
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    css: {
      lightningcss: {
        targets: browserslistToTargets(browserslist('>= 0.5%, last 3 versions, not dead, Chrome >= 60, Safari >= 12, iOS >= 12, Edge >= 79')),
      },
    },

    build: {
      cssMinify: 'lightningcss' as const,
      target: ['es2020', 'chrome69', 'safari12'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/data/**',
          '**/scratch/**',
          '**/*.tmp*',
          '**/*.log',
          '**/.system_generated/**',
        ],
      },
    },
  };
});
