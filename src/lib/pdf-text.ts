// Reconstrói o texto de leitura a partir dos pedaços que o PDF entrega:
// junta pedaços em linhas, respeita duas colunas, remove cabeçalhos/rodapés
// e números de página, e separa parágrafos.
// Esta parte não depende do pdf.js, então pode ser testada no Node.

export interface RawItem {
  str: string
  x: number
  y: number
  w: number
  h: number
}

export interface PageInput {
  items: RawItem[]
  width: number
  height: number
}

interface Seg {
  text: string
  x0: number
  x1: number
  y: number
  h: number
}

interface Line extends Seg {
  /** vem de página com margem de cabeçalho/rodapé? */
  zone: 'top' | 'bottom' | 'body'
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Agrupa itens em linhas e depois em segmentos horizontais (separados por vãos grandes). */
function toSegments(items: RawItem[]): Seg[] {
  const clean = items.filter((it) => it.str.length > 0 && Number.isFinite(it.x) && Number.isFinite(it.y))
  clean.sort((a, b) => b.y - a.y || a.x - b.x)

  const rows: RawItem[][] = []
  for (const it of clean) {
    const row = rows[rows.length - 1]
    if (row) {
      const ref = row[0]
      const tol = 0.5 * Math.max(it.h, ref.h, 1)
      if (Math.abs(ref.y - it.y) <= tol) {
        row.push(it)
        continue
      }
    }
    rows.push([it])
  }

  const segs: Seg[] = []
  for (const row of rows) {
    const maxH = Math.max(...row.map((r) => r.h), 1)
    // some com "sobrescritos" numéricos (notas de rodapé coladas na palavra)
    const kept = row.filter((r) => !(r.h < 0.7 * maxH && /^[\d,\s*†‡-]+$/.test(r.str)))
    kept.sort((a, b) => a.x - b.x)

    let cur: Seg | null = null
    let prevEnd = 0
    let prevH = maxH
    for (const it of kept) {
      const gap = it.x - prevEnd
      // vão entre colunas costuma ter mais de 1,5 em; espaço entre palavras, bem menos
      const bigGap = cur && gap > Math.max(1.5 * Math.min(prevH, it.h || prevH), 10)
      if (!cur || bigGap) {
        if (cur) segs.push(cur)
        cur = { text: it.str, x0: it.x, x1: it.x + it.w, y: it.y, h: it.h }
      } else {
        const needSpace = gap > 0.18 * maxH && !/\s$/.test(cur.text) && !/^\s/.test(it.str)
        cur.text += (needSpace ? ' ' : '') + it.str
        cur.x1 = it.x + it.w
        cur.h = Math.max(cur.h, it.h)
      }
      prevEnd = it.x + it.w
      prevH = it.h || prevH
    }
    if (cur) segs.push(cur)
  }
  for (const s of segs) s.text = s.text.replace(/\s+/g, ' ').trim()
  return segs.filter((s) => s.text.length > 0)
}

/** Procura uma calha vertical vazia perto do meio da página (layout de duas colunas). */
function findGutter(segs: Seg[], width: number): number | null {
  if (segs.length < 20) return null
  const body = segs.filter((s) => s.text.length > 12)
  if (body.length < 16) return null
  let best: { x: number; run: number } | null = null
  let runStart = -1
  const lo = Math.floor(width * 0.3)
  const hi = Math.ceil(width * 0.7)
  for (let x = lo; x <= hi; x++) {
    const crossing = body.filter((s) => s.x0 < x && s.x1 > x).length
    const free = crossing <= Math.max(1, body.length * 0.08)
    if (free) {
      if (runStart < 0) runStart = x
      const run = x - runStart
      if (!best || run > best.run) best = { x: runStart + run / 2, run }
    } else {
      runStart = -1
    }
  }
  if (!best || best.run < 6) return null
  const left = body.filter((s) => (s.x0 + s.x1) / 2 < best!.x).length
  const right = body.length - left
  if (left < body.length * 0.25 || right < body.length * 0.25) return null
  return best.x
}

function orderSegments(segs: Seg[], width: number): Seg[] {
  const gutter = findGutter(segs, width)
  const byY = [...segs].sort((a, b) => b.y - a.y || a.x0 - b.x0)
  if (gutter === null) return byY

  const ordered: Seg[] = []
  let left: Seg[] = []
  let right: Seg[] = []
  const flush = () => {
    ordered.push(...left, ...right)
    left = []
    right = []
  }
  for (const s of byY) {
    if (s.x0 < gutter && s.x1 > gutter) {
      flush()
      ordered.push(s)
    } else if ((s.x0 + s.x1) / 2 < gutter) {
      left.push(s)
    } else {
      right.push(s)
    }
  }
  flush()
  return ordered
}

const PAGE_NUMBER = /^\s*(p[áa]gina|page|p[áa]g\.?)?\s*\d{1,4}(\s*(de|of|\/)\s*\d{1,4})?\s*$/i
const ENDS_SENTENCE = /[.!?…:"”»)]\s*$/

function normKey(t: string): string {
  return t.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Converte páginas em parágrafos (cada parágrafo mantém "\n" entre as linhas). */
export function pagesToParagraphs(pages: PageInput[]): string[][] {
  const pageLines: Line[][] = pages.map((p) => {
    const ordered = orderSegments(toSegments(p.items), p.width)
    return ordered.map((s) => {
      const rel = p.height > 0 ? s.y / p.height : 0.5
      const zone: Line['zone'] = rel > 0.92 ? 'top' : rel < 0.08 ? 'bottom' : 'body'
      return { ...s, zone }
    })
  })

  // cabeçalhos/rodapés: aparecem repetidos (ignorando números) em várias páginas
  const counts = new Map<string, number>()
  for (const lines of pageLines) {
    const seen = new Set<string>()
    for (const l of lines) {
      if (l.zone === 'body') continue
      const k = normKey(l.text)
      if (!seen.has(k)) {
        seen.add(k)
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
  }
  const repeatMin = Math.max(2, Math.ceil(pages.length * 0.4))

  return pageLines.map((lines) => {
    const kept = lines.filter((l) => {
      if (l.zone === 'body') return true
      if (PAGE_NUMBER.test(l.text)) return false
      return !(pages.length >= 3 && (counts.get(normKey(l.text)) ?? 0) >= repeatMin)
    })
    if (!kept.length) return []

    const bodyH = median(kept.map((l) => l.h))
    const gaps: number[] = []
    for (let i = 1; i < kept.length; i++) {
      const g = kept[i - 1].y - kept[i].y
      if (g > 0 && g < 3 * Math.max(bodyH, 1)) gaps.push(g)
    }
    const lineGap = median(gaps) || bodyH * 1.3
    const minX = median(kept.map((l) => l.x0).sort((a, b) => a - b).slice(0, Math.max(3, Math.ceil(kept.length * 0.3))))
    const maxX = Math.max(...kept.map((l) => l.x1))
    const colWidth = Math.max(maxX - minX, 1)

    const paras: string[] = []
    let cur: string[] = []
    let prev: Line | null = null
    const flush = () => {
      if (cur.length) paras.push(cur.join('\n'))
      cur = []
    }

    for (const l of kept) {
      let breakHere = false
      if (prev) {
        const gap = prev.y - l.y
        const biggerFont = l.h > bodyH * 1.18 || prev.h > bodyH * 1.18
        const fontChanged = Math.abs(l.h - prev.h) > bodyH * 0.18
        // o espaçamento normal de títulos (fonte maior) é maior que o do corpo
        const normalGap = Math.max(lineGap, Math.max(prev.h, l.h) * 1.25)
        const bigVertical = gap > normalGap * 1.45 || gap < -2 // volta para o topo → nova coluna/bloco
        const indented = l.x0 - minX > Math.max(bodyH * 0.9, 8) && ENDS_SENTENCE.test(prev.text)
        const shortPrev = prev.x1 - minX < colWidth * 0.62 && ENDS_SENTENCE.test(prev.text)
        breakHere = bigVertical || (biggerFont && fontChanged) || (!biggerFont && (indented || shortPrev))
      }
      if (breakHere) flush()
      cur.push(l.text)
      prev = l
    }
    flush()
    return paras
  })
}
