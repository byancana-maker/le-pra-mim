// Worker que roda o modelo de voz (ONNX Runtime Web, WebAssembly).
// Fica fora da tela principal para a interface não travar enquanto a voz é gerada.

import * as ort from 'onnxruntime-web/wasm'

const ctx = self as unknown as Worker
const CACHE_NAME = 'vozes-piper-v1'

let session: ort.InferenceSession | null = null
let loadedVoice = ''

type InMsg =
  | { type: 'init'; ortBase: string; threads: number }
  | { type: 'load'; id: number; voiceId: string; modelUrl: string }
  | {
      type: 'synth'
      id: number
      ids: number[]
      scales: [number, number, number]
      numSpeakers: number
      speaker: number
    }

async function fetchModel(url: string, onProgress: (loaded: number, total: number) => void): Promise<Uint8Array> {
  let cache: Cache | null = null
  try {
    cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(url)
    if (hit) {
      const buf = new Uint8Array(await hit.arrayBuffer())
      onProgress(buf.length, buf.length)
      return buf
    }
  } catch {
    cache = null // navegação privada ou sem permissão: segue sem guardar
  }

  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Não foi possível baixar a voz (${res.status}).`)
  const total = Number(res.headers.get('content-length') ?? 0)
  const forCache = cache ? res.clone() : null

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress(loaded, total || loaded)
  }
  const out = new Uint8Array(loaded)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  if (cache && forCache) {
    try {
      await cache.put(url, new Response(out, { headers: { 'content-type': 'application/octet-stream' } }))
    } catch {
      /* sem espaço para guardar: a voz funciona, só baixa de novo na próxima vez */
    }
  }
  return out
}

ctx.onmessage = async (e: MessageEvent<InMsg>) => {
  const m = e.data
  try {
    if (m.type === 'init') {
      ort.env.wasm.wasmPaths = m.ortBase
      ort.env.wasm.numThreads = m.threads
      ort.env.wasm.proxy = false
      return
    }

    if (m.type === 'load') {
      if (loadedVoice === m.voiceId && session) {
        ctx.postMessage({ type: 'loaded', id: m.id })
        return
      }
      const bytes = await fetchModel(m.modelUrl, (loaded, total) =>
        ctx.postMessage({ type: 'progress', voiceId: m.voiceId, loaded, total }),
      )
      session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
      loadedVoice = m.voiceId
      ctx.postMessage({ type: 'loaded', id: m.id })
      return
    }

    if (m.type === 'synth') {
      if (!session) throw new Error('Voz ainda não carregada.')
      const feeds: Record<string, ort.Tensor> = {
        input: new ort.Tensor('int64', BigInt64Array.from(m.ids.map((n) => BigInt(n))), [1, m.ids.length]),
        input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(m.ids.length)]), [1]),
        scales: new ort.Tensor('float32', Float32Array.from(m.scales), [3]),
      }
      if (m.numSpeakers > 1) {
        feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(m.speaker)]), [1])
      }
      const out = await session.run(feeds)
      const pcm = new Float32Array(out.output.data as Float32Array)
      ctx.postMessage({ type: 'audio', id: m.id, pcm }, [pcm.buffer])
    }
  } catch (err) {
    const id = 'id' in m ? m.id : -1
    ctx.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
