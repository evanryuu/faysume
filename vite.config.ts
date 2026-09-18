import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.VITEST
      ? []
      : [
          cloudflare(),
          viteStaticCopy({
            targets: ['cmaps', 'standard_fonts', 'wasm'].map((name) => ({
              src: `node_modules/pdfjs-dist/${name}/*`,
              dest: `pdfjs/${name}`,
              rename: { stripBase: true },
            })),
          }),
        ]),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { include: ['pdfjs-dist'] },
  test: { include: ['tests/**/*.test.ts'] },
})
