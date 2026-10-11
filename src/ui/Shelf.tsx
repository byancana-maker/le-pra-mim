import { useRef, useState } from 'react'
import { getGenre } from '../lib/genres.ts'
import type { DocMeta } from '../lib/library.ts'
import { btnPrimary, btnQuiet, IconPlus, Modal } from './common.tsx'

function seed(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

export function DropCard({ onFile, compact }: { onFile: (f: File) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) onFile(f)
      }}
      className={`rounded-3xl border-2 border-dashed text-center transition ${
        over ? 'border-lime bg-lime/10' : 'border-line bg-card'
      } ${compact ? 'p-5' : 'p-8 sm:p-12'}`}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
        aria-label="Escolher arquivo PDF"
      />
      {!compact && (
        <p className="mx-auto mb-5 max-w-md text-lg text-muted">Arraste um PDF para cá ou escolha um arquivo do aparelho.</p>
      )}
      <button type="button" className={btnPrimary} onClick={() => input.current?.click()}>
        <IconPlus />
        {compact ? 'Adicionar outro PDF' : 'Escolher PDF'}
      </button>
    </div>
  )
}

export function Shelf({ docs, onOpen, onRemove }: { docs: DocMeta[]; onOpen: (id: string) => void; onRemove: (id: string) => void }) {
  const [sel, setSel] = useState<DocMeta | null>(null)
  const [confirm, setConfirm] = useState(false)

  return (
    <>
      <div className="shelf" role="list" aria-label="Seus PDFs">
        {docs.map((d) => {
          const g = getGenre(d.genre)
          const r = seed(d.id)
          const height = 138 + (r % 6) * 9
          const width = Math.min(66, Math.max(42, 38 + Math.round(d.pageCount / 10)))
          const pct = d.totalSegments > 0 ? Math.round((d.position / d.totalSegments) * 100) : 0
          return (
            <div key={d.id} className="shelf-cell" role="listitem">
              <button
                type="button"
                className="spine"
                onClick={() => {
                  setConfirm(false)
                  setSel(d)
                }}
                aria-label={`${d.title}, ${g.label}, ${pct}% ouvido`}
                style={{ background: g.color, color: g.ink, width, height }}
              >
                <span
                  className="absolute top-0 left-0 h-1.5 rounded-tl-[5px] bg-lime"
                  style={{ width: `${Math.max(pct, 0)}%` }}
                  aria-hidden="true"
                />
                <span className="spine-text text-[0.95rem]">{d.title}</span>
              </button>
            </div>
          )
        })}
      </div>

      {sel && (
        <Modal
          title={sel.title}
          onClose={() => setSel(null)}
          footer={
            confirm ? (
              <>
                <span className="mr-auto text-sm text-muted">Remover este PDF deste navegador?</span>
                <button type="button" className={btnQuiet} onClick={() => setConfirm(false)}>
                  Manter
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-full bg-red-600 px-5 font-semibold text-white"
                  onClick={() => {
                    onRemove(sel.id)
                    setSel(null)
                  }}
                >
                  Remover PDF
                </button>
              </>
            ) : (
              <>
                <button type="button" className={btnQuiet} onClick={() => setConfirm(true)}>
                  Remover
                </button>
                <button type="button" className={btnPrimary} onClick={() => onOpen(sel.id)}>
                  {sel.position > 0 ? 'Continuar ouvindo' : 'Começar a ouvir'}
                </button>
              </>
            )
          }
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-muted">Gênero</dt>
            <dd className="font-semibold">{getGenre(sel.genre).label}</dd>
            <dt className="text-muted">Tamanho</dt>
            <dd>
              {sel.pageCount} páginas · {sel.words.toLocaleString('pt-BR')} palavras
            </dd>
            <dt className="text-muted">Ouvido</dt>
            <dd>{sel.totalSegments > 0 ? Math.round((sel.position / sel.totalSegments) * 100) : 0}%</dd>
          </dl>
        </Modal>
      )}
    </>
  )
}
