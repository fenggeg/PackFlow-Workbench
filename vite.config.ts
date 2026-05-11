import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath, URL} from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  clearScreen: false,
  build: {
    // After route-level code splitting the largest chunk is the shared React/AntD runtime.
    // Keeping this threshold explicit makes real regressions visible without warning on normal desktop builds.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['src-tauri'],
  },
})
