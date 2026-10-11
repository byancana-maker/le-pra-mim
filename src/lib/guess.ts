// Palpite de gênero a partir do texto. É só uma sugestão; a pessoa sempre confirma.

import type { GenreId } from './genres.ts'

export interface Guess {
  genre: GenreId
  reason: string
}

export function guessGenre(pages: string[][]): Guess | null {
  const paras = pages.flat()
  if (paras.length < 5) return null
  const head = pages.slice(0, 4).flat().join(' ').slice(0, 6000).toLowerCase()
  const all = paras.join(' ')

  const hasAbstract = /\b(resumo|abstract|palavras-chave|keywords)\b/.test(head)
  const hasRefs = /(^|\n)\s*(refer[êe]ncias|references|bibliografia)\s*(\n|$)/i.test(paras.join('\n'))
  const authorYear = (all.match(/\([A-ZÀ-Ú][\p{L}\-]+(?: et al\.?)?,? (?:19|20)\d{2}[a-z]?\)/gu) ?? []).length
  const numeric = (all.match(/\[\d+(?:[,–-]\s*\d+)*\]/g) ?? []).length
  if ((hasAbstract && (hasRefs || authorYear > 3)) || authorYear > 12 || numeric > 20) {
    return { genre: 'cientifico', reason: 'Tem resumo, citações e referências, como um artigo científico.' }
  }

  const dialogue = paras.filter((p) => /^(—|–|["“«])/.test(p.trim())).length
  if (dialogue / paras.length > 0.12) {
    return { genre: 'romance', reason: 'Tem muitas falas com travessão ou aspas, como uma obra de ficção.' }
  }

  return null
}
