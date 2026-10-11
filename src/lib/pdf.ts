// Leitura do PDF no navegador (pdf.js). Nada é enviado para servidor nenhum.

// build "legacy": inclui os polyfills para navegadores um pouco mais antigos (principalmente celulares)
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { pagesToParagraphs, type PageInput, type RawItem } from './pdf-text.ts'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface ParsedPdf {
  title: string
  pages: string[][]
  words: number
  /** PDF sem texto selecionável (escaneado) */
  scanned: boolean
}

export interface ParseProgress {
  page: number
  total: number
}

export async function parsePdf(
  file: File,
  onProgress?: (p: ParseProgress) => void,
): Promise<ParsedPdf> {
  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  const doc = await task.promise
  const inputs: PageInput[] = []

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const view = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: RawItem[] = []
    for (const it of content.items) {
      if (!('str' in it)) continue
      const t = it.transform as number[]
      items.push({
        str: it.str,
        x: t[4],
        y: t[5],
        w: it.width,
        h: it.height || Math.hypot(t[2], t[3]),
      })
    }
    inputs.push({ items, width: view.width, height: view.height })
    page.cleanup()
    onProgress?.({ page: n, total: doc.numPages })
    // deixa a interface respirar em PDFs grandes
    if (n % 10 === 0) await new Promise((r) => setTimeout(r, 0))
  }

  let title = file.name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim()
  try {
    const meta = await doc.getMetadata()
    const t = (meta.info as { Title?: string } | undefined)?.Title?.trim()
    if (t && t.length > 3 && t.length < 140) title = t
  } catch {
    /* metadados são opcionais */
  }
  await task.destroy()

  const pages = pagesToParagraphs(inputs)
  const words = pages.reduce(
    (sum, paras) => sum + paras.reduce((s, p) => s + (p.match(/\S+/g)?.length ?? 0), 0),
    0,
  )
  return { title, pages, words, scanned: words < Math.max(30, inputs.length * 5) }
}
