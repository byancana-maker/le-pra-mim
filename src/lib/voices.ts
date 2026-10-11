// Vozes do Piper em português do Brasil.
// Os modelos são baixados do Hugging Face na primeira vez que a voz é usada
// e ficam guardados no navegador (Cache API), então da segunda vez abrem na hora.

export interface VoiceDef {
  id: string // ex.: pt_BR-faber-medium, st-F1
  name: string
  quality: 'x_low' | 'low' | 'medium' | 'high'
  /** tamanho aproximado do download, em MB */
  approxMB: number
  /** motor que gera a voz (padrão: piper) */
  engine?: 'piper' | 'supertonic'
  gender?: 'F' | 'M'
  /** texto curto que substitui o rótulo de qualidade */
  note?: string
}

// ---------- Vozes avançadas (Supertonic) ----------
// Modelo de voz mais novo, que roda no próprio navegador. Um único download (alguns
// centenas de MB) libera as 10 vozes; elas diferem pelo "estilo" (arquivo pequeno).
export const SUPERTONIC_REPO =
  'https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/aafc6e32416a594460b32413efc49d7fe4ce6d46/'
export const SUPERTONIC_ONNX_URL = `${SUPERTONIC_REPO}onnx/`
export const supertonicStyleUrl = (style: string) => `${SUPERTONIC_REPO}voice_styles/${style}.json`

export const isSupertonic = (voiceId: string) => voiceId.startsWith('st-')
export const supertonicStyle = (voiceId: string) => voiceId.slice(3)

export const SUPERTONIC_VOICES: VoiceDef[] = [
  ...[1, 2, 3, 4, 5].map((n) => ({ id: `st-F${n}`, name: `Feminina ${n}`, gender: 'F' as const })),
  ...[1, 2, 3, 4, 5].map((n) => ({ id: `st-M${n}`, name: `Masculina ${n}`, gender: 'M' as const })),
].map((v) => ({
  ...v,
  quality: 'high' as const,
  approxMB: 300,
  engine: 'supertonic' as const,
  note: 'voz avançada',
}))

export const BUILTIN_VOICES: VoiceDef[] = [
  { id: 'pt_BR-faber-medium', name: 'Faber', quality: 'medium', approxMB: 60 },
  { id: 'pt_BR-cadu-medium', name: 'Cadu', quality: 'medium', approxMB: 60 },
  { id: 'pt_BR-jeff-medium', name: 'Jeff', quality: 'medium', approxMB: 60 },
  { id: 'pt_BR-edresson-low', name: 'Edresson', quality: 'low', approxMB: 60 },
]

export const DEFAULT_VOICE_ID = BUILTIN_VOICES[0].id

const HF_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/'

/** pt_BR-faber-medium → pt/pt_BR/faber/medium/pt_BR-faber-medium */
export function voiceBaseUrl(voiceId: string): string {
  const [lang, name, quality] = voiceId.split('-')
  const family = lang.split('_')[0]
  return `${HF_BASE}${family}/${lang}/${name}/${quality}/${voiceId}`
}

export const VOICES_INDEX_URL = `${HF_BASE}voices.json`

const QUALITY_LABEL: Record<VoiceDef['quality'], string> = {
  x_low: 'qualidade básica',
  low: 'qualidade simples',
  medium: 'qualidade média',
  high: 'qualidade alta',
}

export function qualityLabel(q: VoiceDef['quality']): string {
  return QUALITY_LABEL[q]
}

/** Interpreta o voices.json do Piper e devolve só as vozes pt_BR. */
export function parseVoicesIndex(json: unknown): VoiceDef[] {
  if (!json || typeof json !== 'object') return []
  const out: VoiceDef[] = []
  for (const [key, raw] of Object.entries(json as Record<string, any>)) {
    if (!key.startsWith('pt_BR-')) continue
    const quality = raw?.quality as VoiceDef['quality'] | undefined
    if (quality !== 'x_low' && quality !== 'low' && quality !== 'medium' && quality !== 'high') continue
    const files = raw?.files ?? {}
    let bytes = 0
    for (const [path, info] of Object.entries(files as Record<string, any>)) {
      if (path.endsWith('.onnx')) bytes = Number(info?.size_bytes ?? 0)
    }
    const name = String(raw?.name ?? key.split('-')[1])
    out.push({
      id: key,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      quality,
      approxMB: bytes ? Math.round(bytes / 1_000_000) : 60,
    })
  }
  return out
}

/** Tom da voz: altera o timbre sem mudar o ritmo. */
export interface Tone {
  id: 'grave' | 'natural' | 'agudo'
  label: string
  /** fator de altura; 1 = original */
  pitch: number
}

export const TONES: Tone[] = [
  { id: 'grave', label: 'Grave', pitch: 0.9 },
  { id: 'natural', label: 'Natural', pitch: 1 },
  { id: 'agudo', label: 'Agudo', pitch: 1.12 },
]

export function toneById(id: string): Tone {
  return TONES.find((t) => t.id === id) ?? TONES[1]
}
