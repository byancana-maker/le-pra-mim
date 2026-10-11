// Prepara o texto para ser falado: tira o que atrapalha a escuta
// (citações, links, símbolos) e expande abreviações.

const NAME = "[A-ZÀ-Ú][\\p{L}'’\\-]+"
const AUTHORS = `${NAME}(?:\\s+(?:et al\\.?|e|&|and)\\s+${NAME})?`
// (Silva, 2020) · (Silva et al., 2020a) · (Silva e Souza, 2019; Lima, 2021, p. 45)
const AUTHOR_YEAR = new RegExp(
  `\\s*\\(\\s*(?:cf\\.?\\s*|ver\\s*|veja\\s*|apud\\s*)?${AUTHORS}\\s*,?\\s*(?:19|20)\\d{2}[a-z]?` +
    `(?:\\s*[;,]\\s*(?:${AUTHORS}\\s*,?\\s*)?(?:19|20)\\d{2}[a-z]?)*` +
    `(?:\\s*,\\s*p{1,2}\\.?\\s*\\d+(?:\\s*[-–]\\s*\\d+)?)?\\s*\\)`,
  'gu',
)
// [1] · [1, 2] · [3–5]
const NUMERIC_CITATION = /\s*\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]/g

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bSr\./g, 'Senhor'],
  [/\bSra\./g, 'Senhora'],
  [/\bSrta\./g, 'Senhorita'],
  [/\bDra\./g, 'Doutora'],
  [/\bDr\./g, 'Doutor'],
  [/\bProfa\./g, 'Professora'],
  [/\bProf\./g, 'Professor'],
  [/\bFigs\./g, 'Figuras'],
  [/\bFig\./g, 'Figura'],
  [/\bTab\./g, 'Tabela'],
  [/\bet al\.?/g, 'e colaboradores'],
  [/\bpp\.\s*(?=\d)/gi, 'páginas '],
  [/\bp\.\s*(?=\d)/g, 'página '],
  [/\bcaps\.\s*(?=\d)/gi, 'capítulos '],
  [/\bcap\.\s*(?=\d)/gi, 'capítulo '],
  [/\bex\.\s*(?=[:,\d])/gi, 'exemplo'],
  [/\bi\.e\./gi, 'isto é,'],
  [/\be\.g\./gi, 'por exemplo,'],
  [/\bvs\.?(?=\s)/gi, 'versus'],
  [/\betc\./gi, 'etcétera.'],
  [/\bnº\s*/gi, 'número '],
  [/\bn\.º\s*/gi, 'número '],
  [/\bNo\.\s*(?=\d)/g, 'número '],
  [/\bAv\./g, 'Avenida'],
  [/\bLtda\.?/g, 'Limitada'],
]

export interface PrepOptions {
  skipCitations: boolean
}

export function stripCitations(text: string): string {
  return text.replace(AUTHOR_YEAR, '').replace(NUMERIC_CITATION, '')
}

export function prepareForSpeech(input: string, opts: PrepOptions): string {
  let t = input
    // invisíveis e espaços estranhos
    .replace(/[­​-‍﻿]/g, '')
    .replace(/[   ]/g, ' ')

  if (opts.skipCitations) t = stripCitations(t)

  t = t
    // endereços de internet e e-mails
    .replace(/https?:\/\/\S+|www\.\S+/gi, 'link')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, 'e-mail')

  for (const [re, rep] of ABBREVIATIONS) t = t.replace(re, rep)

  t = t
    // R$ 1.234,56 → 1.234,56 reais
    .replace(/R\$\s?(\d[\d.]*(?:,\d+)?)/g, '$1 reais')
    .replace(/(\d)\s?%/g, '$1 por cento')
    .replace(/&/g, ' e ')
    // iniciais soltas: "J. K. Rowling" → "J K Rowling" (evita falsa quebra de frase)
    .replace(/\b([A-ZÀ-Ú])\.(?=\s+[A-ZÀ-Ú])/g, '$1')
    // travessão de fala não deve ser lido
    .replace(/^[\s—–-]+(?=\S)/, '')
    .replace(/\s[—–]\s/g, ', ')
    // aspas e marcadores
    .replace(/[“”«»"]/g, '')
    .replace(/[*_#^~`|<>{}]/g, ' ')
    .replace(/\.{3,}|…/g, '…')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .trim()

  return t
}

/** Garante uma pontuação final para a voz fechar a frase com a entonação certa. */
export function withEndingPunctuation(text: string, mid: boolean): string {
  const t = text.trim()
  if (!t) return t
  if (/[.!?…]$/.test(t)) return t
  if (/[,;:]$/.test(t)) return mid ? t : t.slice(0, -1) + '.'
  return t + (mid ? ',' : '.')
}

/** Só tem pontuação/símbolos? Então não há o que falar. */
export function isSpeakable(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}
