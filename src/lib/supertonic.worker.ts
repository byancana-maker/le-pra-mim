// Worker das vozes avançadas (Supertonic). Quatro modelos ONNX em sequência:
// duração → codificação do texto → refinamento do sinal (vários passos) → voz.
// Baseado no exemplo oficial para navegador do Supertonic.

import * as ort from 'onnxruntime-web/wasm'

const ctx = self as unknown as Worker
const CACHE_NAME = 'vozes-supertonic-v1'

interface Cfg {
  ae: { sample_rate: number; base_chunk_size: number }
  ttl: { chunk_compress_factor: number; latent_dim: number }
}
interface Style {
  ttl: ort.Tensor
  dp: ort.Tensor
}

let sessions: {
  dp: ort.InferenceSession
  enc: ort.InferenceSession
  vec: ort.InferenceSession
  voc: ort.InferenceSession
} | null = null
let cfg: Cfg | null = null
let indexer: number[] = []
let loadedBase = ''
const styles = new Map<string, Style>()

type InMsg =
  | { type: 'init'; ortBase: string; threads: number }
  | { type: 'load'; id: number; voiceId: string; onnxBase: string; styleUrl: string }
  | { type: 'synth'; id: number; text: string; styleUrl: string; steps: number; speed: number }

async function fetchBytes(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  let cache: Cache | null = null
  try {
    cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(url)
    if (hit) {
      const buf = new Uint8Array(await hit.arrayBuffer())
      onProgress?.(buf.length, buf.length)
      return buf
    }
  } catch {
    cache = null
  }
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Não foi possível baixar a voz (${res.status}).`)
  const total = Number(res.headers.get('content-length') ?? 0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress?.(loaded, total || loaded)
  }
  const out = new Uint8Array(loaded)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  if (cache) {
    try {
      await cache.put(url, new Response(out, { headers: { 'content-type': 'application/octet-stream' } }))
    } catch {
      /* sem espaço: funciona, só baixa de novo na próxima vez */
    }
  }
  return out
}

const fetchJson = async <T>(url: string): Promise<T> => JSON.parse(new TextDecoder().decode(await fetchBytes(url))) as T

// ---------- texto ----------
const EMOJI =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu
const REPLACE: Array<[string, string]> = [
  ['–', '-'], ['‑', '-'], ['—', '-'], ['_', ' '],
  ['“', '"'], ['”', '"'], ['‘', "'"], ['’', "'"],
  ['´', "'"], ['`', "'"], ['[', ' '], [']', ' '], ['|', ' '], ['/', ' '], ['#', ' '], ['→', ' '], ['←', ' '],
]

function toIds(raw: string, lang: string): number[] {
  let t = raw.normalize('NFKD').replace(EMOJI, '')
  for (const [k, v] of REPLACE) t = t.split(k).join(v)
  t = t.replace(/[♥☆♡©\\]/g, '')
  t = t.replace(/ ,/g, ',').replace(/ \./g, '.').replace(/ !/g, '!').replace(/ \?/g, '?')
  t = t.replace(/ ;/g, ';').replace(/ :/g, ':').replace(/ '/g, "'")
  while (t.includes('""')) t = t.replace('""', '"')
  while (t.includes("''")) t = t.replace("''", "'")
  t = t.replace(/\s+/g, ' ').trim()
  if (!/[.!?;:,'")\]}…。」』】〉》›»]$/.test(t)) t += '.'
  t = `<${lang}>${t}</${lang}>`
  const ids: number[] = []
  for (let j = 0; j < t.length; j++) {
    const cp = t.codePointAt(j) ?? 0
    ids.push(cp < indexer.length ? indexer[cp] : -1)
  }
  return ids
}

// ---------- modelos ----------
function randn(n: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(0.0001, Math.random())
    out[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random())
  }
  return out
}

async function loadStyle(url: string): Promise<Style> {
  const hit = styles.get(url)
  if (hit) return hit
  const j = await fetchJson<{ style_ttl: { dims: number[]; data: unknown }; style_dp: { dims: number[]; data: unknown } }>(url)
  const mk = (o: { dims: number[]; data: unknown }) =>
    new ort.Tensor('float32', Float32Array.from((o.data as number[]).flat(Infinity) as number[]), o.dims)
  const s = { ttl: mk(j.style_ttl), dp: mk(j.style_dp) }
  styles.set(url, s)
  return s
}

async function synth(text: string, style: Style, steps: number, speed: number): Promise<Float32Array> {
  if (!sessions || !cfg) throw new Error('Voz ainda não carregada.')
  const ids = toIds(text, 'pt')
  const n = ids.length
  const textIds = new ort.Tensor('int64', BigInt64Array.from(ids.map((x) => BigInt(x))), [1, n])
  const textMask = new ort.Tensor('float32', new Float32Array(n).fill(1), [1, 1, n])

  const dpOut = await sessions.dp.run({ text_ids: textIds, style_dp: style.dp, text_mask: textMask })
  const duration = Number((dpOut.duration.data as Float32Array)[0]) / speed

  const enc = await sessions.enc.run({ text_ids: textIds, style_ttl: style.ttl, text_mask: textMask })
  const textEmb = enc.text_emb

  const sr = cfg.ae.sample_rate
  const chunk = cfg.ae.base_chunk_size * cfg.ttl.chunk_compress_factor
  const dim = cfg.ttl.latent_dim * cfg.ttl.chunk_compress_factor
  const wavLen = Math.floor(duration * sr)
  const T = Math.max(1, Math.ceil(wavLen / chunk))

  let xt: Float32Array = randn(dim * T)
  const latentMask = new ort.Tensor('float32', new Float32Array(T).fill(1), [1, 1, T])
  const total = new ort.Tensor('float32', Float32Array.from([steps]), [1])
  for (let s = 0; s < steps; s++) {
    const out = await sessions.vec.run({
      noisy_latent: new ort.Tensor('float32', xt, [1, dim, T]),
      text_emb: textEmb,
      style_ttl: style.ttl,
      latent_mask: latentMask,
      text_mask: textMask,
      current_step: new ort.Tensor('float32', Float32Array.from([s]), [1]),
      total_step: total,
    })
    xt = new Float32Array(out.denoised_latent.data as Float32Array)
  }

  const voc = await sessions.voc.run({ latent: new ort.Tensor('float32', xt, [1, dim, T]) })
  const wav = voc.wav_tts.data as Float32Array
  return new Float32Array(wav.subarray(0, Math.min(wav.length, Math.max(wavLen, 1))))
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
      if (loadedBase !== m.onnxBase) {
        const files = ['duration_predictor', 'text_encoder', 'vector_estimator', 'vocoder']
        const sizes = new Array(files.length).fill(0)
        const loadedBytes = new Array(files.length).fill(0)
        const report = () => {
          const loaded = loadedBytes.reduce((a, b) => a + b, 0)
          // o tamanho total só é conhecido quando todos começaram; enquanto isso, estima pelo que há
          const known = sizes.filter(Boolean).length
          const total = known === files.length ? sizes.reduce((a, b) => a + b, 0) : 0
          ctx.postMessage({ type: 'progress', voiceId: m.voiceId, loaded, total })
        }
        const bufs: Uint8Array[] = []
        for (let i = 0; i < files.length; i++) {
          bufs.push(
            await fetchBytes(`${m.onnxBase}${files[i]}.onnx`, (l, t) => {
              loadedBytes[i] = l
              sizes[i] = t
              report()
            }),
          )
        }
        cfg = await fetchJson<Cfg>(`${m.onnxBase}tts.json`)
        indexer = await fetchJson<number[]>(`${m.onnxBase}unicode_indexer.json`)
        const opts = { executionProviders: ['wasm' as const] }
        const [dp, enc, vec, voc] = await Promise.all(bufs.map((b) => ort.InferenceSession.create(b, opts)))
        sessions = { dp, enc, vec, voc }
        loadedBase = m.onnxBase
      }
      await loadStyle(m.styleUrl)
      ctx.postMessage({ type: 'loaded', id: m.id, sampleRate: cfg!.ae.sample_rate })
      return
    }

    if (m.type === 'synth') {
      const style = await loadStyle(m.styleUrl)
      const pcm = await synth(m.text, style, m.steps, m.speed)
      ctx.postMessage({ type: 'audio', id: m.id, pcm, sampleRate: cfg!.ae.sample_rate }, [pcm.buffer])
    }
  } catch (err) {
    const id = 'id' in m ? m.id : -1
    ctx.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
