// Teste do núcleo (sem navegador): leitura de PDF, parágrafos, frases, perfis de gênero.
// Uso: node --experimental-strip-types scripts/test-core.mts <pasta com artigo.pdf e romance.pdf>
import { readFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pagesToParagraphs, type PageInput, type RawItem } from '../src/lib/pdf-text.ts'
import { buildSegments, splitSentences, splitLong } from '../src/lib/segment.ts'
import { prepareForSpeech } from '../src/lib/prep.ts'
import { getGenre } from '../src/lib/genres.ts'
import { guessGenre } from '../src/lib/guess.ts'
import { shiftPitch } from '../src/lib/audio.ts'

let failed = 0
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) failed++
}

async function extract(path: string): Promise<string[][]> {
  const data = new Uint8Array(readFileSync(path))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  const inputs: PageInput[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const view = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: RawItem[] = []
    for (const it of content.items) {
      if (!('str' in it)) continue
      const t = it.transform as number[]
      items.push({ str: it.str, x: t[4], y: t[5], w: it.width, h: it.height || Math.hypot(t[2], t[3]) })
    }
    inputs.push({ items, width: view.width, height: view.height })
  }
  return pagesToParagraphs(inputs)
}

const dir = process.argv[2]

// ---------- artigo (duas colunas, cabeçalho, rodapé) ----------
const art = await extract(`${dir}/artigo.pdf`)
const artText = art.flat().join('\n')
console.log(`\nArtigo: ${art.length} páginas, ${art.flat().length} parágrafos`)
ok(!/Revista Brasileira de Testes/.test(artText), 'cabeçalho repetido removido')
ok(!art.some((p) => p.some((x) => /^\d{1,2}$/.test(x.trim()))), 'número de página removido')
const firstBody = art[0].join(' ')
ok(/Resumo/.test(firstBody) && /Os resultados indicam/.test(firstBody), 'primeira página tem título, resumo e corpo')
// duas colunas: uma frase não pode ser misturada com a da outra coluna
ok(!/tamanho da amostra \(Silva[^\n]*\n?[^\n]*Estudos anteriores[^\n]*tamanho/.test(artText), 'colunas não se misturam na mesma linha')
const sample = art[1].join(' ').replace(/\s+/g, ' ')
ok(/Os resultados indicam que a variação observada não é explicada apenas pelo tamanho da amostra/.test(sample), 'frase da coluna segue inteira (ordem de leitura)')

const sci = getGenre('cientifico')
const segs = buildSegments(art, sci, { skipCitations: true, skipReferences: true })
console.log(`Segmentos científico: ${segs.length}`)
ok(segs.length > 40, 'gerou trechos suficientes')
ok(!segs.some((s) => /SILVA, J\. et al\./.test(s.display)), 'parou antes das Referências')
ok(segs.some((s) => s.kind === 'heading' && /Introdução/.test(s.display)), 'títulos reconhecidos')
const heads = segs.filter((s) => s.kind === 'heading').map((s) => s.display)
console.log('Títulos:', heads)
ok(['Resumo', 'Introdução', 'Métodos', 'Resultados', 'Discussão'].every((h) => heads.includes(h)), 'seções curtas viram títulos')
const speechAll = segs.map((s) => s.speech).join(' ')
ok(!/Silva et al\., 2020/.test(speechAll) && !/\[1, 2\]/.test(speechAll), 'citações não são faladas')
ok(/Souza e Lima/.test(speechAll) === false || !/\(Souza e Lima \(2019\)\)/.test(speechAll), 'citação narrativa tratada')
ok(/Figura 2/.test(speechAll) && /Doutor Almeida/.test(speechAll), 'abreviações expandidas (Fig., Dr.)')
ok(/45 por cento/.test(speechAll) && /1\.250,50 reais/.test(speechAll), 'porcentagem e moeda por extenso')
ok(/página 12/.test(speechAll), 'p. 12 → página 12')
ok(segs.every((s) => s.speech.length <= 300), 'nenhum trecho passa de 300 caracteres')
const bad = segs.filter((s) => !/[.!?…,;:]$/.test(s.speech))
if (bad.length) console.log('sem pontuação:', bad.slice(0, 3).map((b) => b.speech))
ok(bad.length === 0, 'todo trecho termina com pontuação')
const guess = guessGenre(art)
ok(guess?.genre === 'cientifico', `palpite de gênero para o artigo: ${guess?.genre}`)

// ---------- romance (recuo, falas) ----------
const rom = await extract(`${dir}/romance.pdf`)
console.log(`\nRomance: ${rom.length} páginas, ${rom.flat().length} parágrafos`)
const romance = getGenre('romance')
const rsegs = buildSegments(rom, romance, { skipCitations: false, skipReferences: false })
console.log(`Segmentos romance: ${rsegs.length}`)
ok(rsegs[0].kind === 'heading' && /CAP[IÍ]TULO/i.test(rsegs[0].display), 'capítulo vira título')
const dlg = rsegs.filter((s) => s.kind === 'dialogue')
ok(dlg.length >= 20, `falas reconhecidas (${dlg.length})`)
ok(dlg.every((s) => s.scales === romance.dialogue), 'falas usam o perfil de diálogo')
ok(rsegs.filter((s) => s.kind === 'narration').every((s) => s.scales === romance.narration), 'narração usa o perfil de narração')
ok(dlg.every((s) => !/^[—–-]/.test(s.speech)), 'travessão inicial não é falado')
const action = buildSegments(rom, getGenre('acao'), { skipCitations: false, skipReferences: false })
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
ok(avg(action.map((s) => s.pauseMs)) < avg(rsegs.map((s) => s.pauseMs)), 'ação tem pausas menores que romance')
ok(action[2].scales.length < rsegs[2].scales.length, 'ação fala mais rápido que romance')
const drama = buildSegments(rom, getGenre('drama'), { skipCitations: false, skipReferences: false })
ok(avg(drama.map((s) => s.pauseMs)) > avg(rsegs.map((s) => s.pauseMs)), 'drama tem pausas maiores que romance')
ok(guessGenre(rom)?.genre === 'romance', `palpite de gênero para o romance: ${guessGenre(rom)?.genre}`)

// ---------- frases ----------
const s1 = splitSentences('O Dr. Silva chegou. Ele disse: "Olá!" Depois saiu. J. K. Rowling escreveu isso, etc. e tal. Fim.')
console.log('\nFrases:', s1)
ok(s1.length === 5 && s1[0] === 'O Dr. Silva chegou.' && s1[3].startsWith('J. K. Rowling') && s1[3].endsWith('e tal.'), 'abreviações e iniciais não quebram frase')
const s2 = splitSentences('— Que susto! — disse ela. — Nunca mais faça isso?')
ok(s2.length === 3, `falas com travessão (${s2.length} partes)`)
const long = 'a'.repeat(30) + ', ' + 'b'.repeat(120) + ', ' + 'c'.repeat(150) + ', ' + 'd'.repeat(100)
ok(splitLong(long).every((p) => p.length <= 260), 'frase longa quebra em pontuação')
ok(prepareForSpeech('Veja https://exemplo.com/x e escreva para a@b.com', { skipCitations: false }) === 'Veja link e escreva para e-mail', 'link e e-mail')

// ---------- tom ----------
const tone = new Float32Array(2205).fill(0.1)
ok(shiftPitch(tone, 1.12).length < tone.length && shiftPitch(tone, 0.9).length > tone.length, 'tom altera a reamostragem na direção certa')

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
