// Tailwind v3 handled by PostCSS
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';
import { defineConfig } from 'vite';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      legacy({
        targets: ['defaults', 'not IE 11', 'chrome >= 49', 'safari >= 10', 'ios >= 10', 'samsung >= 4'],
        additionalLegacyPolyfills: ['regenerator-runtime/runtime']
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    css: {
      lightningcss: {
        targets: browserslistToTargets(browserslist('>= 0.5%, last 3 versions, not dead, Chrome >= 50, Safari >= 10, iOS >= 10, Edge >= 15')),
      },
    },

    build: {
      cssMinify: 'lightningcss' as const,
      target: 'es2020',
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
