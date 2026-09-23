import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { jevProxyPlugin } from './server/vite-jev-plugin.ts';

export default defineConfig(({ mode }) => ({
  // The dev and preview servers mount the same proxy handler the deployed site uses, so the
  // OpenRouter key is read server-side in every environment and never reaches the bundle.
  plugins: [react(), jevProxyPlugin(mode, loadEnv)],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
}));
