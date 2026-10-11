// Cliente do motor de voz: fonetiza o texto (espeak-ng em WebAssembly)
// e manda para o worker gerar o áudio.

import type { Scales } from './genres.ts'
import { shiftPitch } from './audio.ts'
import {
  VOICES_INDEX_URL,
  parseVoicesIndex,
  voiceBaseUrl,
  BUILTIN_VOICES,
  SUPERTONIC_VOICES,
  isSupertonic,
  supertonicStyle,
  supertonicStyleUrl,
  SUPERTONIC_ONNX_URL,
  type VoiceDef,
} from './voices.ts'
import TtsWorker from './tts.worker.ts?worker'
import SuperWorker from './supertonic.worker.ts?worker'

const CACHE_NAME = 'vozes-piper-v1'
const SUPER_STEPS = 8 // passos de refinamento: mais = melhor qualidade e mais lento
const SUPER_SPEED = 1.05

export interface VoiceConfig {
  audio: { sample_rate: number }
  num_speakers: number
  phoneme_id_map: Record<string, number[]>
  espeak: { voice: string }
  inference: { noise_scale: number; length_scale: number; noise_w: number }
}

export interface SynthResult {
  pcm: Float32Array
  sampleRate: number
}

export interface DownloadProgress {
  voiceId: string
  loaded: number
  total: number
}

const baseUrl = (sub: string) => new URL(`${import.meta.env.BASE_URL}${sub}`, document.baseURI).href

async function cachedJson<T>(url: string): Promise<T> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(url)
    if (hit) return (await hit.json()) as T
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Falha ao baixar ${url} (${res.status})`)
    await cache.put(url, res.clone())
    return (await res.json()) as T
  } catch (err) {
    const res = await fetch(url)
    if (!res.ok) throw err
    return (await res.json()) as T
  }
}

/**
 * Fonetizador (espeak-ng em WebAssembly). Cada worker para de responder depois de ~92
 * chamadas (limite do módulo), então ele é reciclado antes disso: um worker reserva é
 * aquecido em segundo plano e assume sem pausa. Se uma chamada travar, recicla e tenta de novo.
 */
const PHONEMIZE_SOFT_LIMIT = 50 // começa a aquecer o reserva
const PHONEMIZE_HARD_LIMIT = 70 // troca de worker

class Phonemizer {
  private worker: Worker | null = null
  private spare: Promise<Worker | null> | null = null
  private used = 0
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private basePath: string) {}

  private spawn(): Worker {
    const w = new Worker(`${this.basePath}PhonemizeWebWorker.js`, { type: 'module' })
    w.postMessage({ type: 'constructor', data: { basePath: this.basePath } })
    return w
  }

  private call(w: Worker, text: string, cfg: VoiceConfig, ms: number): Promise<number[]> {
    return new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O fonetizador demorou demais para responder.')), ms)
      w.onmessage = ({ data }) => {
        clearTimeout(timer)
        resolve((data?.phoneme_ids ?? []) as number[])
      }
      w.onerror = (ev) => {
        clearTimeout(timer)
        reject(new Error(ev.message || 'Erro no fonetizador.'))
      }
      w.postMessage({ type: 'phonemize', data: [text, [cfg]] })
    })
  }

  /** Cria um worker e já carrega o módulo (a primeira chamada é a mais lenta). */
  private async warm(cfg: VoiceConfig): Promise<Worker | null> {
    const w = this.spawn()
    try {
      await this.call(w, 'Olá.', cfg, 60000)
      return w
    } catch {
      w.terminate()
      return null
    }
  }

  private async swap(cfg: VoiceConfig): Promise<void> {
    const old = this.worker
    let next = this.spare ? await this.spare : null
    this.spare = null
    if (next) {
      this.used = 1 // o aquecimento já gastou uma chamada
    } else {
      next = this.spawn()
      this.used = 0
    }
    this.worker = next
    old?.terminate()
    void cfg
  }

  private async exec(text: string, cfg: VoiceConfig): Promise<number[]> {
    if (!this.worker) {
      this.worker = this.spawn()
      this.used = 0
    }
    if (this.used >= PHONEMIZE_SOFT_LIMIT && !this.spare) this.spare = this.warm(cfg)
    if (this.used >= PHONEMIZE_HARD_LIMIT) await this.swap(cfg)
    this.used++
    try {
      return await this.call(this.worker, text, cfg, this.used === 1 ? 60000 : 20000)
    } catch (first) {
      // travou: descarta este worker e tenta uma vez com um novo
      const stuck = this.worker
      this.worker = this.spawn()
      this.used = 1
      stuck?.terminate()
      try {
        return await this.call(this.worker, text, cfg, 60000)
      } catch {
        throw first
      }
    }
  }

  run(text: string, cfg: VoiceConfig): Promise<number[]> {
    const next = this.chain.then(
      () => this.exec(text, cfg),
      () => this.exec(text, cfg),
    )
    this.chain = next.catch(() => undefined)
    return next
  }

  destroy() {
    this.worker?.terminate()
    void this.spare?.then((w) => w?.terminate())
    this.worker = null
    this.spare = null
  }
}

export class TtsEngine {
  private ort: Worker
  private sup: Worker | null = null
  private supLoaded = ''
  private threads = 1
  private phonemizer: Phonemizer
  private nextId = 1
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private configs = new Map<string, VoiceConfig>()
  private loadedVoice = ''
  private progressListeners = new Set<(p: DownloadProgress) => void>()

  constructor() {
    this.ort = new TtsWorker()
    const threads = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
      ? Math.min(4, navigator.hardwareConcurrency || 2)
      : 1
    this.threads = threads
    this.ort.postMessage({ type: 'init', ortBase: baseUrl('ort/'), threads })
    this.wire(this.ort)

    this.phonemizer = new Phonemizer(baseUrl('piper/'))
  }

  private wire(w: Worker) {
    w.onmessage = (e) => {
      const m = e.data
      if (m.type === 'progress') {
        this.progressListeners.forEach((fn) => fn({ voiceId: m.voiceId, loaded: m.loaded, total: m.total }))
        return
      }
      const p = this.pending.get(m.id)
      if (!p) return
      this.pending.delete(m.id)
      if (m.type === 'error') p.reject(new Error(m.message))
      else p.resolve(m)
    }
    w.onerror = (ev) => {
      const err = new Error(ev.message || 'Erro no motor de voz.')
      this.pending.forEach((p) => p.reject(err))
      this.pending.clear()
    }
  }

  private superWorker(): Worker {
    if (!this.sup) {
      this.sup = new SuperWorker()
      this.sup.postMessage({ type: 'init', ortBase: baseUrl('ort/'), threads: this.threads })
      this.wire(this.sup)
    }
    return this.sup
  }

  onDownloadProgress(fn: (p: DownloadProgress) => void): () => void {
    this.progressListeners.add(fn)
    return () => this.progressListeners.delete(fn)
  }

  /** Lista de vozes: usa o índice oficial do Piper e, se estiver sem internet, as vozes conhecidas. */
  async listVoices(): Promise<VoiceDef[]> {
    return [...SUPERTONIC_VOICES, ...(await this.listPiperVoices())]
  }

  private async listPiperVoices(): Promise<VoiceDef[]> {
    try {
      const json = await cachedJson<unknown>(VOICES_INDEX_URL)
      const found = parseVoicesIndex(json)
      if (found.length) {
        // as vozes de qualidade média ou melhor vêm primeiro
        const rank = { high: 0, medium: 1, low: 2, x_low: 3 }
        return found
          .filter((v) => v.quality !== 'x_low')
          .sort((a, b) => rank[a.quality] - rank[b.quality] || a.name.localeCompare(b.name))
      }
    } catch {
      /* usa as vozes embutidas */
    }
    return BUILTIN_VOICES
  }

  async config(voiceId: string): Promise<VoiceConfig> {
    const hit = this.configs.get(voiceId)
    if (hit) return hit
    const cfg = await cachedJson<VoiceConfig>(`${voiceBaseUrl(voiceId)}.onnx.json`)
    this.configs.set(voiceId, cfg)
    return cfg
  }

  /** Baixa (se preciso) e carrega a voz no motor. */
  async prepareVoice(voiceId: string): Promise<void> {
    if (isSupertonic(voiceId)) {
      if (this.supLoaded === voiceId) return
      const id = this.nextId++
      await new Promise<void>((resolve, reject) => {
        this.pending.set(id, { resolve: () => resolve(), reject })
        this.superWorker().postMessage({
          type: 'load',
          id,
          voiceId,
          onnxBase: SUPERTONIC_ONNX_URL,
          styleUrl: supertonicStyleUrl(supertonicStyle(voiceId)),
        })
      })
      this.supLoaded = voiceId
      return
    }
    if (this.loadedVoice === voiceId) return
    await this.config(voiceId)
    const id = this.nextId++
    await new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve: () => resolve(), reject })
      this.ort.postMessage({ type: 'load', id, voiceId, modelUrl: `${voiceBaseUrl(voiceId)}.onnx` })
    })
    this.loadedVoice = voiceId
  }

  async synthesize(
    text: string,
    opts: { voiceId: string; scales: Scales; pitch: number },
  ): Promise<SynthResult> {
    if (isSupertonic(opts.voiceId)) return this.synthesizeSuper(text, opts)
    const cfg = await this.config(opts.voiceId)
    await this.prepareVoice(opts.voiceId)
    const ids = await this.phonemizer.run(text, cfg)
    if (!ids.length) return { pcm: new Float32Array(0), sampleRate: cfg.audio.sample_rate }

    const id = this.nextId++
    const res = await new Promise<{ pcm: Float32Array }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ort.postMessage({
        type: 'synth',
        id,
        ids,
        // ritmo compensado: o tom reamostra o áudio e desfaz a diferença
        scales: [opts.scales.noise, opts.scales.length * opts.pitch, opts.scales.noiseW],
        numSpeakers: cfg.num_speakers,
        speaker: 0,
      })
    })
    return { pcm: shiftPitch(res.pcm, opts.pitch), sampleRate: cfg.audio.sample_rate }
  }

  private async synthesizeSuper(
    text: string,
    opts: { voiceId: string; scales: Scales; pitch: number },
  ): Promise<SynthResult> {
    await this.prepareVoice(opts.voiceId)
    const id = this.nextId++
    const res = await new Promise<{ pcm: Float32Array; sampleRate: number }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.superWorker().postMessage({
        type: 'synth',
        id,
        text,
        styleUrl: supertonicStyleUrl(supertonicStyle(opts.voiceId)),
        steps: SUPER_STEPS,
        // velocidade base 1,05 (padrão do modelo); length > 1 = mais devagar; o tom é compensado
        speed: SUPER_SPEED / (opts.scales.length * opts.pitch),
      })
    })
    return { pcm: shiftPitch(res.pcm, opts.pitch), sampleRate: res.sampleRate }
  }

  destroy() {
    this.sup?.terminate()
    this.ort.terminate()
    this.phonemizer.destroy()
  }
}

let shared: TtsEngine | null = null
export function getEngine(): TtsEngine {
  if (!shared) shared = new TtsEngine()
  return shared
}
