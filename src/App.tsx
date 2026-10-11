import { useCallback, useEffect, useState } from 'react'
import { buildSegments } from './lib/segment.ts'
import { getGenre } from './lib/genres.ts'
import { listDocs, newId, removeDoc, saveDoc, type DocMeta } from './lib/library.ts'
import { parsePdf, type ParsedPdf } from './lib/pdf.ts'
import { getEngine } from './lib/tts.ts'
import { BUILTIN_VOICES, toneById, type VoiceDef } from './lib/voices.ts'
import { Logo, ThemeButton, useTheme, btnQuiet } from './ui/common.tsx'
import { NewBook, type NewBookResult } from './ui/NewBook.tsx'
import { Reader } from './ui/Reader.tsx'
import { DropCard, Shelf } from './ui/Shelf.tsx'

type View =
  | { name: 'shelf' }
  | { name: 'new'; parsed: ParsedPdf }
  | { name: 'reader'; id: string }

export default function App() {
  const { theme, toggle } = useTheme()
  const [view, setView] = useState<View>({ name: 'shelf' })
  const [docs, setDocs] = useState<DocMeta[] | null>(null)
  const [voices, setVoices] = useState<VoiceDef[]>(BUILTIN_VOICES)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const engine = getEngine()

  const refresh = useCallback(() => {
    void listDocs().then(setDocs)
  }, [])

  useEffect(() => {
    if (view.name === 'shelf') refresh()
  }, [view.name, refresh])

  useEffect(() => {
    void engine.listVoices().then(setVoices)
  }, [engine])

  const onFile = async (file: File) => {
    setError(null)
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setError('Este arquivo não é um PDF. Escolha um arquivo que termine em .pdf.')
      return
    }
    setBusy('Lendo o PDF… 0%')
    try {
      const parsed = await parsePdf(file, (p) => setBusy(`Lendo o PDF… ${Math.round((p.page / p.total) * 100)}%`))
      if (parsed.scanned) {
        setError(
          'Este PDF parece ser uma imagem escaneada, sem texto para ler. Faça o reconhecimento de texto (OCR) no PDF e envie de novo.',
        )
      } else {
        setView({ name: 'new', parsed })
      }
    } catch {
      setError('Não foi possível abrir este PDF. Ele pode estar protegido por senha ou danificado.')
    } finally {
      setBusy(null)
    }
  }

  const start = async (parsed: ParsedPdf, r: NewBookResult) => {
    const genre = getGenre(r.genre)
    const total = buildSegments(parsed.pages, genre, {
      skipCitations: r.skipCitations,
      skipReferences: r.skipReferences,
    }).length
    const now = Date.now()
    const meta: DocMeta = {
      id: newId(),
      title: r.title,
      fileName: r.title,
      genre: r.genre,
      voiceId: r.voiceId,
      tone: toneById(r.tone).id,
      speed: 1,
      skipCitations: r.skipCitations,
      skipReferences: r.skipReferences,
      pageCount: parsed.pages.length,
      words: parsed.words,
      position: 0,
      totalSegments: total,
      createdAt: now,
      updatedAt: now,
    }
    await saveDoc(meta, parsed.pages)
    setView({ name: 'reader', id: meta.id })
  }

  if (view.name === 'reader') {
    return (
      <Reader
        key={view.id}
        id={view.id}
        engine={engine}
        voices={voices}
        theme={theme}
        toggleTheme={toggle}
        onBack={() => setView({ name: 'shelf' })}
      />
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeButton theme={theme} toggle={toggle} />
      </header>

      {view.name === 'new' ? (
        <NewBook
          parsed={view.parsed}
          engine={engine}
          voices={voices}
          onCancel={() => setView({ name: 'shelf' })}
          onStart={(r) => void start(view.parsed, r)}
        />
      ) : (
        <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
          {docs !== null && docs.length === 0 ? (
            <section className="pt-6 sm:pt-12">
              <h1 className="max-w-2xl font-display text-[2.6rem] leading-[1.05] font-semibold sm:text-6xl">
                Escolha um PDF e ouça.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted">
                A voz muda conforme o gênero: mais calma num artigo científico, mais solta nas falas de um romance.
                Tudo roda no seu navegador, de graça, e dá para baixar o áudio em MP3.
              </p>
              <div className="mt-8">
                <DropCard onFile={(f) => void onFile(f)} />
              </div>
            </section>
          ) : (
            <section className="pt-4">
              <h1 className="mb-6 font-display text-4xl font-semibold">Sua estante</h1>
              {docs && <Shelf docs={docs} onOpen={(id) => setView({ name: 'reader', id })} onRemove={(id) => void removeDoc(id).then(refresh)} />}
              <div className="mt-8">
                <DropCard onFile={(f) => void onFile(f)} compact />
              </div>
              <p className="mt-6 text-sm text-muted">Os PDFs ficam salvos só neste navegador. Nada é enviado para servidor nenhum.</p>
            </section>
          )}

          {busy && (
            <p className="mt-6 rounded-2xl bg-card p-4 font-semibold" role="status">
              {busy}
            </p>
          )}
          {error && (
            <div className="mt-6 flex items-start justify-between gap-4 rounded-2xl bg-red-500/10 p-4 text-red-800 dark:text-red-200" role="alert">
              <p>{error}</p>
              <button type="button" className={btnQuiet} onClick={() => setError(null)}>
                Entendi
              </button>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
