// Utilidades de áudio: reamostragem (tom), conversão e arquivo WAV.

/** Muda a altura da voz sem mudar a duração: o texto foi sintetizado mais devagar
 *  por `pitch` e aqui é reamostrado de volta, então o ritmo final é o original. */
export function shiftPitch(pcm: Float32Array, pitch: number): Float32Array {
  if (Math.abs(pitch - 1) < 0.001) return pcm
  const outLen = Math.max(1, Math.floor(pcm.length / pitch))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * pitch
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, pcm.length - 1)
    const f = pos - i0
    out[i] = pcm[i0] * (1 - f) + pcm[i1] * f
  }
  return out
}

export function floatToInt16(pcm: Float32Array, trailingSilenceMs = 0, sampleRate = 22050): Int16Array {
  const pad = Math.round((trailingSilenceMs / 1000) * sampleRate)
  const out = new Int16Array(pcm.length + pad)
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i]
    out[i] = v >= 1 ? 0x7fff : v <= -1 ? -0x8000 : (v * 0x8000) | 0
  }
  return out
}

export function int16ToWavBlob(samples: Int16Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  new Int16Array(buffer, 44).set(samples)
  return new Blob([buffer], { type: 'audio/wav' })
}
