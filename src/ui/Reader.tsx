import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getGenre, GENRES, type GenreId } from '../lib/genres.ts'
import { getMeta, loadPages, updateMeta, type DocMeta } from '../lib/library.ts'
import { Player, type PlayerState } from '../lib/player.ts'
import { buildSegments, estimateTotalSeconds, type Segment } from '../lib/segment.ts'
import type { TtsEngine } from '../lib/tts.ts'
import { toneById, type Tone, type VoiceDef } from '../lib/voices.ts'
import { keepAwake } from '../lib/wake.ts'
import { ExportDialog } from './ExportDialog.tsx'
import { GenrePicker } from './GenrePicker.tsx'
import { VoicePicker } from './VoicePicker.tsx'
import {
  btnPrimary,
  btnQuiet,
  Equalizer,
  formatDuration,
  IconBack,
  IconDownload,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconSliders,
  Logo,
  Modal,
  ThemeButton,
} from './common.tsx'

const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

/** Procura no novo texto o trecho que corresponde à mesma posição de leitura. */
function remap(oldSegs: Segment[], oldIndex: number, next: Segment[]): number {
  let offset = 0
  for (let i = 0; i < oldIndex && i < oldSegs.length; i++) offset += oldSegs[i].display.length
  let acc = 0
  for (let i = 0; i < next.length; i++) {
    if (acc >= offset) return i
    acc += next[i].display.length
  }
  return Math.max(0, next.length - 1)
}

export function Reader({
  id,
  engine,
  voices,
  theme,
  toggleTheme,
  onBack,
}: {
  id: string
  engine: TtsEngine
  voices: VoiceDef[]
  theme: 'light' | 'dark'
  toggleTheme: () => void
  onBack: () => void
}) {
  const [meta, setMeta] = useState<DocMeta | null>(null)
  const [pages, setPages] = useState<string[][] | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [state, setState] = useState<PlayerState>({ index: 0, status: 'idle', speed: 1 })
  const [viewPage, setViewPage] = useState(1)
  const [follow, setFollow] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [download, setDownload] = useState<number | null>(null)
  const [missing, setMissing] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)

  const playerRef = useRef<Player | null>(null)
  const segmentsRef = useRef<Segment[]>([])
  const metaRef = useRef<DocMeta | null>(null)
  const lastSaved = useRef({ at: 0, index: -1 })
  segmentsRef.current = segments
  metaRef.current = meta

  // carrega o PDF salvo e prepara o reprodutor
  useEffect(() => {
    let cancelled = false
    let player: Player | null = null
    let unsub: (() => void) | null = null
    void (async () => {
      const [m, p] = await Promise.all([getMeta(id), loadPages(id)])
      if (cancelled) return
      if (!m || !p) {
        setMissing(true)
        return
      }
      const segs = buildSegments(p, getGenre(m.genre), { skipCitations: m.skipCitations, skipReferences: m.skipReferences })
      player = new Player(engine)
      player.setTitle(m.title)
      player.load(segs, m.position, { voiceId: m.voiceId, pitch: toneById(m.tone).pitch })
      player.setSpeed(m.speed)
      unsub = player.subscribe(setState)
      playerRef.current = player
      setMeta(m)
      setPages(p)
      setSegments(segs)
      setViewPage(segs[Math.min(m.position, segs.length - 1)]?.page ?? 1)
    })()
    return () => {
      cancelled = true
      unsub?.()
      player?.dispose()
      playerRef.current = null
    }
  }, [id, engine])

  useEffect(() => engine.onDownloadProgress((p) => setDownload(p.loaded >= p.total ? null : Math.round((p.loaded / Math.max(p.total, 1)) * 100))), [engine])

  // salva a posição de leitura de tempos em tempos
  useEffect(() => {
    const m = metaRef.current
    if (!m || !segments.length) return
    const now = Date.now()
    const paused = state.status !== 'playing'
    if (state.index !== lastSaved.current.index && (now - lastSaved.current.at > 4000 || paused)) {
      lastSaved.current = { at: now, index: state.index }
      void updateMeta(id, { position: state.index, totalSegments: segments.length })
    }
  }, [state.index, state.status, segments.length, id])

  // acompanha o trecho que está sendo lido
  useEffect(() => {
    if (!follow) return
    const seg = segments[state.index]
    if (seg) setViewPage(seg.page)
  }, [state.index, follow, segments])

  useEffect(() => {
    if (!follow || state.status === 'idle') return
    const el = document.getElementById(`seg-${state.index}`)
    if (!el) return
    const r = el.getBoundingClientRect()
    const h = window.innerHeight
    if (r.top < h * 0.18 || r.bottom > h * 0.62) {
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
    }
  }, [state.index, state.status, follow, viewPage])

  // tela acesa enquanto toca
  useEffect(() => {
    if (state.status !== 'playing') return
    let release: (() => void) | null = null
    let dead = false
    void keepAwake().then((r) => (dead ? r() : (release = r)))
    return () => {
      dead = true
      release?.()
    }
  }, [state.status])

  const byPage = useMemo(() => {
    const map = new Map<number, Segment[]>()
    for (const s of segments) {
      const arr = map.get(s.page)
      if (arr) arr.push(s)
      else map.set(s.page, [s])
    }
    return map
  }, [segments])
  const pageNumbers = useMemo(() => [...byPage.keys()].sort((a, b) => a - b), [byPage])

  const goPage = useCallback(
    (dir: -1 | 1) => {
      const k = pageNumbers.indexOf(viewPage)
      const next = pageNumbers[Math.min(Math.max(k + dir, 0), pageNumbers.length - 1)]
      if (next !== undefined) {
        setFollow(false)
        setViewPage(next)
        window.scrollTo({ top: 0 })
      }
    },
    [pageNumbers, viewPage],
  )

  const applySettings = async (next: {
    genre: GenreId
    voiceId: string
    tone: Tone['id']
    skipCitations: boolean
    skipReferences: boolean
  }) => {
    const m = metaRef.current
    const player = playerRef.current
    if (!m || !pages || !player) return
    const segs = buildSegments(pages, getGenre(next.genre), {
      skipCitations: next.skipCitations,
      skipReferences: next.skipReferences,
    })
    const index = remap(segmentsRef.current, state.index, segs)
    const updated = await updateMeta(id, { ...next, position: index, totalSegments: segs.length })
    if (updated) setMeta(updated)
    setSegments(segs)
    player.reconfigure(segs, index, { voiceId: next.voiceId, pitch: toneById(next.tone).pitch })
    setFollow(true)
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <p className="text-lg">Não encontramos este PDF salvo neste navegador.</p>
        <button type="button" className={`${btnPrimary} mt-6`} onClick={onBack}>
          Voltar para a estante
        </button>
      </div>
    )
  }
  if (!meta || !pages) {
    return <p className="p-10 text-center text-muted">Abrindo o PDF…</p>
  }

  const genre = getGenre(meta.genre)
  const player = playerRef.current
  const active = state.status === 'playing' || state.status === 'buffering'
  const current = segments[state.index]
  const shownIndex = scrub ?? state.index
  const remainingSec = estimateTotalSeconds(segments, shownIndex) / state.speed
  const pageSegs = byPage.get(viewPage) ?? []

  // blocos de leitura da página: títulos e parágrafos
  const blocks: Array<{ heading: boolean; segs: Segment[] }> = []
  for (const s of pageSegs) {
    const last = blocks[blocks.length - 1]
    const isHead = s.kind === 'heading'
    if (!last || s.paraStart || isHead || last.heading) blocks.push({ heading: isHead, segs: [s] })
    else last.segs.push(s)
  }

  const statusText =
    state.status === 'error'
      ? state.error
      : state.status === 'buffering'
        ? download !== null
          ? `Baixando a voz… ${download}%`
          : 'Gerando a voz…'
        : state.status === 'finished'
          ? 'Fim do texto.'
          : null

  const idx = pageNumbers.indexOf(viewPage)

  return (
    <div className="min-h-dvh pb-52">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2 sm:px-6">
          <button type="button" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-line/60" aria-label="Voltar para a estante">
            <IconBack />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-semibold leading-tight">{meta.title}</h1>
            <p className="flex items-center gap-2 text-sm text-muted">
              <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: genre.color }} aria-hidden="true" />
              <span className="truncate">{genre.label}</span>
            </p>
          </div>
          <ThemeButton theme={theme} toggle={toggleTheme} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pt-6 sm:px-6">
        <nav className="mb-6 flex items-center justify-between gap-3" aria-label="Páginas">
          <button type="button" className={btnQuiet} onClick={() => goPage(-1)} disabled={idx <= 0}>
            <IconBack /> Anterior
          </button>
          <label className="flex items-center gap-2 text-sm text-muted">
            Página
            <input
              type="number"
              min={pageNumbers[0]}
              max={pageNumbers[pageNumbers.length - 1]}
              value={viewPage}
              onChange={(e) => {
                const n = Number(e.target.value)
                const target = pageNumbers.find((p) => p >= n) ?? pageNumbers[pageNumbers.length - 1]
                if (n && target) {
                  setFollow(false)
                  setViewPage(target)
                }
              }}
              className="w-20 rounded-xl border border-line bg-card px-2 py-2 text-center font-semibold text-ink"
              aria-label="Ir para a página"
            />
            de {pages.length}
          </label>
          <button type="button" className={btnQuiet} onClick={() => goPage(1)} disabled={idx < 0 || idx >= pageNumbers.length - 1}>
            Próxima <IconBack className="rotate-180" />
          </button>
        </nav>

        {!follow && current && current.page !== viewPage && (
          <button
            type="button"
            className="sticky top-20 z-10 mb-4 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper shadow-lg"
            onClick={() => {
              setFollow(true)
              setViewPage(current.page)
            }}
          >
            Voltar para onde a voz está (página {current.page})
          </button>
        )}

        <article className="reading" lang="pt-BR">
          {blocks.length === 0 && <p className="text-muted">Esta página não tem texto para ler.</p>}
          {blocks.map((b, k) =>
            b.heading ? (
              <h2 key={k} className="mt-8 mb-3 font-display text-[1.7rem] leading-tight font-semibold">
                {b.segs.map((s) => (
                  <Seg key={s.i} s={s} current={s.i === state.index} onPick={() => player?.playFrom(s.i)} />
                ))}
              </h2>
            ) : (
              <p key={k} className={meta.genre === 'poesia' ? 'mb-6 whitespace-pre-line' : 'mb-5'}>
                {b.segs.map((s) => (
                  <Seg key={s.i} s={s} current={s.i === state.index} onPick={() => player?.playFrom(s.i)} line={s.kind === 'line'} />
                ))}
              </p>
            ),
          )}
        </article>
      </main>

      {/* Barra do player */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card shadow-[0_-8px_24px_rgba(18,33,58,0.08)]"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-2xl px-4 pt-3 sm:px-6">
          <input
            type="range"
            min={0}
            max={Math.max(segments.length - 1, 0)}
            value={shownIndex}
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={() => {
              if (scrub !== null) {
                setFollow(true)
                if (active) player?.playFrom(scrub)
                else player?.seek(scrub)
                setScrub(null)
              }
            }}
            onKeyUp={() => {
              if (scrub !== null) {
                setFollow(true)
                player?.seek(scrub)
                setScrub(null)
              }
            }}
            className="h-6 w-full"
            aria-label="Posição no texto"
            aria-valuetext={`Página ${segments[shownIndex]?.page ?? 1} de ${pages.length}`}
          />
          <div className="flex justify-between text-sm text-muted">
            <span>
              Página {segments[shownIndex]?.page ?? 1} de {pages.length}
            </span>
            <span>faltam cerca de {formatDuration(remainingSec)}</span>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2 pb-1">
            <div className="flex items-center gap-1">
              <button type="button" className="grid h-12 w-12 place-items-center rounded-full hover:bg-line/60" onClick={() => player?.prev()} aria-label="Frase anterior">
                <IconPrev />
              </button>
              <button
                type="button"
                className="grid h-16 w-16 place-items-center rounded-full bg-lime text-on-lime shadow-md transition hover:brightness-105"
                onClick={() => {
                  setFollow(true)
                  player?.toggle()
                }}
                aria-label={active ? 'Pausar' : 'Ouvir'}
              >
                {active ? <IconPause className="h-8 w-8" /> : <IconPlay className="h-8 w-8" />}
              </button>
              <button type="button" className="grid h-12 w-12 place-items-center rounded-full hover:bg-line/60" onClick={() => player?.next()} aria-label="Próxima frase">
                <IconNext />
              </button>
            </div>

            <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 sm:flex">
              <Equalizer on={state.status === 'playing'} />
              {statusText && (
                <span className={`truncate text-sm ${state.status === 'error' ? 'text-red-600 dark:text-red-300' : 'text-muted'}`} role={state.status === 'error' ? 'alert' : 'status'}>
                  {statusText}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className="min-h-11 min-w-14 rounded-full border border-line px-3 font-semibold hover:bg-line/50"
                onClick={() => {
                  const k = SPEEDS.indexOf(state.speed)
                  const next = SPEEDS[(k + 1) % SPEEDS.length]
                  player?.setSpeed(next)
                  void updateMeta(id, { speed: next })
                }}
                aria-label={`Velocidade ${state.speed} vezes. Tocar para mudar`}
              >
                {String(state.speed).replace('.', ',')}×
              </button>
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full hover:bg-line/60" onClick={() => setShowSettings(true)} aria-label="Ajustes de gênero e voz">
                <IconSliders />
              </button>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full hover:bg-line/60"
                onClick={() => {
                  player?.pause()
                  setShowExport(true)
                }}
                aria-label="Baixar em MP3"
              >
                <IconDownload />
              </button>
            </div>
          </div>
          {statusText && (
            <p className={`pb-1 text-center text-sm sm:hidden ${state.status === 'error' ? 'text-red-600 dark:text-red-300' : 'text-muted'}`} role={state.status === 'error' ? 'alert' : 'status'}>
              {statusText}
            </p>
          )}
        </div>
      </div>

      {showSettings && (
        <SettingsDialog
          meta={meta}
          engine={engine}
          voices={voices}
          onClose={() => setShowSettings(false)}
          onApply={(n) => {
            setShowSettings(false)
            void applySettings(n)
          }}
        />
      )}

      {showExport && (
        <ExportDialog
          engine={engine}
          segments={segments}
          currentIndex={state.index}
          pageNumbers={pageNumbers}
          title={meta.title}
          voiceId={meta.voiceId}
          pitch={toneById(meta.tone).pitch}
          onClose={() => setShowExport(false)}
        />
      )}

      <div className="mx-auto mt-12 max-w-2xl px-6 text-center text-muted">
        <Logo className="text-xl opacity-60" />
      </div>
    </div>
  )
}

function Seg({ s, current, onPick, line }: { s: Segment; current: boolean; onPick: () => void; line?: boolean }) {
  return (
    <>
      <span
        id={`seg-${s.i}`}
        className={`seg${current ? ' seg-current' : ''}`}
        onClick={onPick}
        role="button"
        tabIndex={-1}
        aria-label="Ouvir a partir daqui"
      >
        {s.display}
      </span>
      {line ? '\n' : ' '}
    </>
  )
}

function SettingsDialog({
  meta,
  engine,
  voices,
  onClose,
  onApply,
}: {
  meta: DocMeta
  engine: TtsEngine
  voices: VoiceDef[]
  onClose: () => void
  onApply: (n: {
    genre: GenreId
    voiceId: string
    tone: Tone['id']
    skipCitations: boolean
    skipReferences: boolean
  }) => void
}) {
  const [genre, setGenre] = useState<GenreId>(meta.genre)
  const [voiceId, setVoiceId] = useState(meta.voiceId)
  const [tone, setTone] = useState<Tone['id']>(meta.tone)
  const [skipCitations, setSkipCitations] = useState(meta.skipCitations)
  const [skipReferences, setSkipReferences] = useState(meta.skipReferences)

  return (
    <Modal
      title="Gênero e voz"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnQuiet} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={btnPrimary} onClick={() => onApply({ genre, voiceId, tone, skipCitations, skipReferences })}>
            Aplicar e continuar
          </button>
        </>
      }
    >
      <h3 className="mb-3 font-display text-xl font-semibold">Do que se trata?</h3>
      <GenrePicker
        value={genre}
        onChange={(id) => {
          setGenre(id)
          const g = GENRES.find((x) => x.id === id)!
          setSkipCitations(g.skipCitations)
          setSkipReferences(g.skipReferences)
        }}
      />
      <h3 className="mt-8 mb-3 font-display text-xl font-semibold">Voz</h3>
      <VoicePicker engine={engine} voices={voices} voiceId={voiceId} tone={tone} genre={getGenre(genre)} onVoice={setVoiceId} onTone={setTone} />
      <fieldset className="mt-6">
        <legend className="mb-1 font-semibold">O que não ler</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-[var(--lime)]" checked={skipCitations} onChange={(e) => setSkipCitations(e.target.checked)} />
          Citações, como (Silva, 2020) e [12]
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-[var(--lime)]" checked={skipReferences} onChange={(e) => setSkipReferences(e.target.checked)} />
          Tudo depois de “Referências”
        </label>
      </fieldset>
    </Modal>
  )
}
