// Exporta o áudio em MP3: gera trecho a trecho e já codifica, sem guardar o áudio bruto na memória.

import { Mp3Encoder } from '@breezystack/lamejs'
import { floatToInt16 } from './audio.ts'
import type { Segment } from './segment.ts'
import type { TtsEngine } from './tts.ts'

export interface ExportOptions {
  segments: Segment[]
  from: number
  /** exclusivo */
  to: number
  voiceId: string
  pitch: number
  kbps: 64 | 96 | 128
  /** divide em arquivos de no máximo N minutos; 0 = um arquivo só */
  splitMinutes: number
  baseName: string
  signal: AbortSignal
  onProgress: (p: { done: number; total: number; elapsedMs: number }) => void
}

export interface ExportedFile {
  name: string
  blob: Blob
  seconds: number
}

export async function exportMp3(engine: TtsEngine, opts: ExportOptions): Promise<ExportedFile[]> {
  const total = Math.max(0, opts.to - opts.from)
  const files: ExportedFile[] = []
  const started = performance.now()

  let encoder: Mp3Encoder | null = null
  let rate = 0
  let chunks: Uint8Array[] = []
  let seconds = 0

  const finishPart = () => {
    if (!encoder) return
    const tail = encoder.flush()
    if (tail.length) chunks.push(tail)
    const part = files.length + 1
    files.push({
      name: `${opts.baseName}${opts.splitMinutes > 0 ? ` - parte ${String(part).padStart(2, '0')}` : ''}.mp3`,
      blob: new Blob(chunks as BlobPart[], { type: 'audio/mpeg' }),
      seconds,
    })
    encoder = null
    chunks = []
    seconds = 0
  }

  for (let n = 0; n < total; n++) {
    if (opts.signal.aborted) throw new DOMException('Exportação cancelada', 'AbortError')
    const seg = opts.segments[opts.from + n]
    const res = await engine.synthesize(seg.speech, {
      voiceId: opts.voiceId,
      scales: seg.scales,
      pitch: opts.pitch,
    })
    rate = res.sampleRate
    if (!encoder) encoder = new Mp3Encoder(1, rate, opts.kbps)

    const samples = floatToInt16(res.pcm, seg.pauseMs, rate)
    const block = 1152 * 8
    for (let i = 0; i < samples.length; i += block) {
      const out = encoder.encodeBuffer(samples.subarray(i, i + block))
      if (out.length) chunks.push(out)
    }
    seconds += samples.length / rate

    if (opts.splitMinutes > 0 && seconds >= opts.splitMinutes * 60 && n < total - 1) finishPart()
    opts.onProgress({ done: n + 1, total, elapsedMs: performance.now() - started })
    // respira para a tela continuar respondendo
    if (n % 4 === 0) await new Promise((r) => setTimeout(r, 0))
  }
  finishPart()
  return files
}
