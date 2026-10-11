import { useMemo, useState } from 'react'
import { getGenre, GENRES, type GenreId } from '../lib/genres.ts'
import { guessGenre } from '../lib/guess.ts'
import { buildSegments, estimateTotalSeconds } from '../lib/segment.ts'
import type { ParsedPdf } from '../lib/pdf.ts'
import type { TtsEngine } from '../lib/tts.ts'
import { DEFAULT_VOICE_ID, type Tone, type VoiceDef } from '../lib/voices.ts'
import { btnPrimary, btnQuiet, formatDuration, IconBack } from './common.tsx'
import { GenrePicker } from './GenrePicker.tsx'
import { VoicePicker } from './VoicePicker.tsx'

export interface NewBookResult {
  title: string
  genre: GenreId
  voiceId: string
  tone: Tone['id']
  skipCitations: boolean
  skipReferences: boolean
}

export function NewBook({
  parsed,
  engine,
  voices,
  onCancel,
  onStart,
}: {
  parsed: ParsedPdf
  engine: TtsEngine
  voices: VoiceDef[]
  onCancel: () => void
  onStart: (r: NewBookResult) => void
}) {
  const [title, setTitle] = useState(parsed.title)
  const [genreId, setGenreId] = useState<GenreId | null>(null)
  const [voiceId, setVoiceId] = useState(voices[0]?.id ?? DEFAULT_VOICE_ID)
  const [tone, setTone] = useState<Tone['id']>('natural')
  const [skipCitations, setSkipCitations] = useState(false)
  const [skipReferences, setSkipReferences] = useState(false)

  const suggestion = useMemo(() => guessGenre(parsed.pages), [parsed.pages])
  const genre = getGenre(genreId ?? 'outro')

  const pickGenre = (id: GenreId) => {
    setGenreId(id)
    const g = GENRES.find((x) => x.id === id)!
    setSkipCitations(g.skipCitations)
    setSkipReferences(g.skipReferences)
  }

  const estimate = useMemo(() => {
    if (!genreId) return null
    const segs = buildSegments(parsed.pages, genre, { skipCitations, skipReferences })
    return { seconds: estimateTotalSeconds(segs), count: segs.length }
  }, [parsed.pages, genre, genreId, skipCitations, skipReferences])

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-32 sm:px-6">
      <button type="button" onClick={onCancel} className={`${btnQuiet} -ml-2 border-transparent`}>
        <IconBack /> Voltar para a estante
      </button>

      <div className="mt-4">
        <label htmlFor="titulo" className="font-semibold">
          Nome do PDF
        </label>
        <input
          id="titulo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-2xl border border-line bg-card px-4 py-3 font-display text-2xl font-semibold"
        />
        <p className="mt-2 text-muted">
          {parsed.pages.length} páginas · {parsed.words.toLocaleString('pt-BR')} palavras
          {estimate && <> · cerca de {formatDuration(estimate.seconds)} de áudio</>}
        </p>
      </div>

      <section className="mt-10" aria-labelledby="h-genero">
        <h2 id="h-genero" className="mb-4 font-display text-3xl font-semibold">
          Do que se trata?
        </h2>
        <GenrePicker value={genreId} onChange={pickGenre} suggestion={suggestion} />
      </section>

      {genreId && (
        <section className="mt-10" aria-labelledby="h-voz">
          <h2 id="h-voz" className="mb-4 font-display text-3xl font-semibold">
            Qual voz?
          </h2>
          <VoicePicker
            engine={engine}
            voices={voices}
            voiceId={voiceId}
            tone={tone}
            genre={genre}
            onVoice={setVoiceId}
            onTone={setTone}
          />

          <fieldset className="mt-8">
            <legend className="mb-2 font-semibold">O que não ler</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--lime)]"
                checked={skipCitations}
                onChange={(e) => setSkipCitations(e.target.checked)}
              />
              Citações, como (Silva, 2020) e [12]
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--lime)]"
                checked={skipReferences}
                onChange={(e) => setSkipReferences(e.target.checked)}
              />
              Tudo depois de “Referências”
            </label>
          </fieldset>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <p className="hidden text-sm text-muted sm:block">
            {genreId ? `${genre.label} · ${voices.find((v) => v.id === voiceId)?.name ?? ''}` : 'Escolha o gênero para continuar.'}
          </p>
          <button
            type="button"
            className={`${btnPrimary} w-full sm:w-auto`}
            disabled={!genreId || !title.trim()}
            onClick={() =>
              genreId &&
              onStart({ title: title.trim(), genre: genreId, voiceId, tone, skipCitations, skipReferences })
            }
          >
            Começar a ouvir
          </button>
        </div>
      </div>
    </div>
  )
}
