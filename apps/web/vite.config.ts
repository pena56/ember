import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Ember Reader',
        short_name: 'Ember',
        description: 'Local-first PDF reader with reading habit tracking',
        theme_color: '#ffffff',
      },
    }),
  ],
});
