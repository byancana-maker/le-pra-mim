import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// base './' deixa o site funcionar em qualquer hospedagem gratuita,
// inclusive em subpastas (GitHub Pages: usuario.github.io/nome-do-repo/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        // Motor de inferência (ONNX Runtime Web) usado pelo worker de voz
        { src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', dest: 'ort', rename: { stripBase: true } },
        { src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', dest: 'ort', rename: { stripBase: true } },
        // Fonetizador do Piper (espeak-ng em WebAssembly)
        { src: 'node_modules/piper-tts-web/dist/piper/piper_phonemize.wasm', dest: 'piper', rename: { stripBase: true } },
        { src: 'node_modules/piper-tts-web/dist/piper/piper_phonemize.data', dest: 'piper', rename: { stripBase: true } },
        { src: 'node_modules/piper-tts-web/dist/worker/PhonemizeWebWorker.js', dest: 'piper', rename: { stripBase: true } },
      ],
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Lê pra mim',
        short_name: 'Lê pra mim',
        description: 'Ouça seus PDFs com vozes de IA que mudam conforme o gênero do texto.',
        lang: 'pt-BR',
        theme_color: '#12213a',
        background_color: '#eef1f5',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['ort/**', 'piper/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // Arquivos pesados do motor de voz: baixados uma vez e guardados para uso offline
            urlPattern: ({ url }) => /\/(ort|piper)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'motor-de-voz', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022' },
})
