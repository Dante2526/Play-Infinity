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
        targets: browserslistToTargets(browserslist('>= 0.5%, last 2 versions, not dead, Chrome >= 87, Safari >= 14, iOS >= 14, Edge >= 88')),
      },
    },

    build: {
      cssMinify: 'lightningcss' as const,
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor_react: ['react', 'react-dom'],
            vendor_firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            vendor_player: ['hls.js']
          }
        }
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true
        }
      },
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
