import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
