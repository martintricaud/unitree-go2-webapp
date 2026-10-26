import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  // Under Vitest, compile rune modules and resolve `svelte` as client code, so `$derived` and `$effect` run.
  plugins: [svelte({ dynamicCompileOptions: () => (process.env.VITEST ? { generate: 'client' } : undefined) })],
  ssr: process.env.VITEST ? { resolve: { conditions: ['browser'] } } : undefined,
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
