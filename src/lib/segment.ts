// Transforma as páginas extraídas do PDF em "trechos": cada trecho é uma frase
// (ou pedaço de frase longa) que será sintetizada e destacada na tela.

import type { Genre, Scales } from './genres.ts'
import { isSpeakable, prepareForSpeech, withEndingPunctuation } from './prep.ts'

export type SegmentKind = 'narration' | 'dialogue' | 'heading' | 'line'

export interface Segment {
  /** posição na lista */
  i: number
  /** página (1-based) onde o trecho começa */
  page: number
  /** texto como aparece na tela */
  display: string
  /** texto como será falado */
  speech: string
  kind: SegmentKind
  /** primeiro trecho de um parágrafo? */
  paraStart: boolean
  /** silêncio depois do trecho, em ms */
  pauseMs: number
  scales: Scales
}

export interface SegmentOptions {
  skipCitations: boolean
  skipReferences: boolean
}

const MAX_LEN = 260

const ABBR = new Set([
  'sr', 'sra', 'srta', 'dr', 'dra', 'prof', 'profa', 'eng', 'exmo', 'exma', 'ilmo', 'ilma',
  'fig', 'figs', 'tab', 'cap', 'caps', 'pág', 'pag', 'pp', 'p', 'vol', 'vols', 'ed', 'eds',
  'ex', 'etc', 'al', 'cf', 'obs', 'av', 'apt', 'nº', 'no', 'num', 'vs', 'min', 'aprox', 'art',
  'arts', 'inc', 'ltda', 'cia', 'séc', 'sec', 'dep', 'gen', 'cel', 'maj', 'ten', 'sgt', 'pe',
  'sto', 'sta', 'jr', 'ibid', 'op', 'cit', 'id', 'apud', 'sp', 'rj',
])

const HEADING_WORDS = /^(cap[ií]tulo|parte|livro|pr[oó]logo|ep[ií]logo|introdu[cç][aã]o|conclus[aã]o|sum[aá]rio|agradecimentos|resumo|abstract|ap[êe]ndice|anexo|se[cç][aã]o)\b/i
const NUMBERED_HEADING = /^\d+(\.\d+)*\.?\s+\p{Lu}/u
const REFERENCES_HEADING = /^(refer[êe]ncias?(\s+bibliogr[áa]ficas?)?|bibliografia|references|obras citadas)\s*:?$/i

export function isHeading(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 90) return false
  if (/[.!?…,;]$/.test(t) && !HEADING_WORDS.test(t)) return false
  if (HEADING_WORDS.test(t)) return true
  if (NUMBERED_HEADING.test(t) && t.length < 80) return true
  const letters = t.replace(/[^\p{L}]/gu, '')
  if (letters.length >= 3 && letters === letters.toUpperCase() && !/\d{3,}/.test(t)) return true
  // linha curta, sem pontuação final, começando em maiúscula: quase sempre é um título
  const words = t.split(/\s+/).length
  return words <= 10 && t.length <= 80 && /^\p{Lu}/u.test(t) && !/^[—–"“«-]/.test(t) && !/[,;:]$/.test(t)
}

function startsDialogue(text: string): boolean {
  return /^(—|–|-\s|["“«])/.test(text.trim())
}

/** Divide um parágrafo em frases, respeitando abreviações e iniciais. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let start = 0
  const re = /([.!?…]+)(["”’»)\]]*)(\s+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const punct = m[1]
    const end = m.index + m[0].length
    const after = text.slice(end)
    const next = after.charAt(0)
    if (!next) continue

    if (punct === '.' || punct === '…') {
      // minúscula logo depois → a frase continua
      if (/\p{Ll}/u.test(next)) continue
      if (punct === '.') {
        const before = text.slice(start, m.index)
        const word = /([\p{L}.]+)$/u.exec(before)?.[1]?.toLowerCase() ?? ''
        if (word && (ABBR.has(word.replace(/\.$/, '')) || word.length === 1)) continue
        // número de lista ("1. Introdução") no meio do texto
        if (/^\d+$/.test(word) && before.length === word.length) continue
      }
    } else if (/\p{Ll}/u.test(next)) {
      continue
    }

    out.push(text.slice(start, end).trim())
    start = end
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out
}

/** Quebra frases muito longas em pontuação interna (vírgula, ponto e vírgula, dois-pontos). */
export function splitLong(sentence: string, max = MAX_LEN): string[] {
  const parts: string[] = []
  let s = sentence.trim()
  while (s.length > max) {
    let cut = -1
    for (const re of [/[;:]\s/g, /,\s/g, /\s[—–]\s/g]) {
      let m: RegExpExecArray | null
      let best = -1
      re.lastIndex = 0
      while ((m = re.exec(s)) && m.index + m[0].length <= max) {
        if (m.index + m[0].length >= 70) best = m.index + m[0].length
      }
      if (best > 0) {
        cut = best
        break
      }
    }
    if (cut < 0) {
      const sp = s.lastIndexOf(' ', max)
      cut = sp > 40 ? sp + 1 : max
    }
    parts.push(s.slice(0, cut).trim())
    s = s.slice(cut).trim()
  }
  if (s) parts.push(s)
  return parts
}

interface Para {
  page: number
  text: string
}

/** Junta parágrafos que continuam na página seguinte. */
function flatten(pages: string[][]): Para[] {
  const out: Para[] = []
  pages.forEach((paras, idx) => {
    paras.forEach((text, k) => {
      const t = text.trim()
      if (!t) return
      const prev = out[out.length - 1]
      const continues =
        k === 0 &&
        prev &&
        !/[.!?…:;"”»)\]]\s*$/.test(prev.text) &&
        /^\p{Ll}/u.test(t) &&
        prev.text.length > 40 &&
        !isHeading(prev.text)
      if (continues) {
        prev.text = prev.text.replace(/-$/, '') + (prev.text.endsWith('-') ? '' : '\n') + t
      } else {
        out.push({ page: idx + 1, text: t })
      }
    })
  })
  return out
}

export function buildSegments(pages: string[][], genre: Genre, opts: SegmentOptions): Segment[] {
  const paras = flatten(pages)
  const segs: Segment[] = []
  const totalPages = pages.length

  const push = (
    page: number,
    display: string,
    kind: SegmentKind,
    paraStart: boolean,
    pauseMs: number,
    scales: Scales,
    mid: boolean,
  ) => {
    const speechRaw = prepareForSpeech(display, { skipCitations: opts.skipCitations })
    if (!isSpeakable(speechRaw)) return
    segs.push({
      i: segs.length,
      page,
      display,
      speech: withEndingPunctuation(speechRaw, mid),
      kind,
      paraStart,
      pauseMs,
      scales,
    })
  }

  for (const para of paras) {
    // linhas "coladas" por hífen de fim de linha
    const joined = para.text.replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')

    if (genre.respectLines) {
      const lines = joined.split('\n').map((l) => l.trim()).filter(Boolean)
      lines.forEach((line, k) => {
        const last = k === lines.length - 1
        push(
          para.page,
          line,
          'line',
          k === 0,
          last ? genre.pauses.paragraph : genre.pauses.line,
          genre.narration,
          false,
        )
      })
      continue
    }

    const flat = joined.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()

    if (
      opts.skipReferences &&
      REFERENCES_HEADING.test(flat) &&
      para.page >= Math.ceil(totalPages * 0.3)
    ) {
      break
    }

    if (isHeading(flat)) {
      push(para.page, flat, 'heading', true, genre.pauses.heading, genre.heading, false)
      continue
    }

    const dialogue = startsDialogue(flat)
    const kind: SegmentKind = dialogue ? 'dialogue' : 'narration'
    const scales = dialogue ? genre.dialogue : genre.narration
    const basePause = dialogue ? genre.pauses.dialogue : genre.pauses.sentence

    const pieces: Array<{ text: string; mid: boolean }> = []
    for (const sentence of splitSentences(flat)) {
      const parts = splitLong(sentence)
      parts.forEach((p, k) => pieces.push({ text: p, mid: k < parts.length - 1 }))
    }
    pieces.forEach((p, k) => {
      const lastOfPara = k === pieces.length - 1
      const pause = p.mid ? 120 : lastOfPara ? genre.pauses.paragraph : basePause
      push(para.page, p.text, kind, k === 0, pause, scales, p.mid)
    })
  }

  return segs
}

/** Estimativa de duração (segundos) de um trecho: ~15 caracteres por segundo na velocidade 1. */
export function estimateSeconds(seg: Segment): number {
  return (seg.speech.length / 15) * seg.scales.length + seg.pauseMs / 1000
}

export function estimateTotalSeconds(segs: Segment[], from = 0, to = segs.length): number {
  let total = 0
  for (let i = from; i < to && i < segs.length; i++) total += estimateSeconds(segs[i])
  return total
}
