import { useEffect, useMemo, useRef, useState } from 'react'
import { exportMp3, type ExportedFile } from '../lib/export.ts'
import { estimateTotalSeconds, type Segment } from '../lib/segment.ts'
import type { TtsEngine } from '../lib/tts.ts'
import { keepAwake } from '../lib/wake.ts'
import { btnPrimary, btnQuiet, formatDuration, IconDownload, Modal } from './common.tsx'

type Range = 'here' | 'all' | 'pages'

export function ExportDialog({
  engine,
  segments,
  currentIndex,
  pageNumbers,
  title,
  voiceId,
  pitch,
  onClose,
}: {
  engine: TtsEngine
  segments: Segment[]
  currentIndex: number
  pageNumbers: number[]
  title: string
  voiceId: string
  pitch: number
  onClose: () => void
}) {
  const firstPage = pageNumbers[0] ?? 1
  const lastPage = pageNumbers[pageNumbers.length - 1] ?? 1
  const [range, setRange] = useState<Range>('all')
  const [p1, setP1] = useState(firstPage)
  const [p2, setP2] = useState(lastPage)
  const [split, setSplit] = useState(0)
  const [kbps, setKbps] = useState<64 | 96 | 128>(64)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; elapsedMs: number } | null>(null)
  const [files, setFiles] = useState<Array<ExportedFile & { url: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const [from, to] = useMemo<[number, number]>(() => {
    if (range === 'here') return [currentIndex, segments.length]
    if (range === 'all') return [0, segments.length]
    const a = segments.findIndex((s) => s.page >= Math.min(p1, p2))
    let b = segments.length
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].page <= Math.max(p1, p2)) {
        b = i + 1
        break
      }
    }
    return [a < 0 ? segments.length : a, b]
  }, [range, p1, p2, currentIndex, segments])

  const seconds = estimateTotalSeconds(segments, from, to)
  const sizeMB = (seconds * kbps * 1000) / 8 / 1_000_000

  useEffect(
    () => () => {
      abort.current?.abort()
      files.forEach((f) => URL.revokeObjectURL(f.url))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const start = async () => {
    setError(null)
    files.forEach((f) => URL.revokeObjectURL(f.url))
    setFiles([])
    setRunning(true)
    setProgress({ done: 0, total: to - from, elapsedMs: 0 })
    const ctl = new AbortController()
    abort.current = ctl
    const release = await keepAwake()
    try {
      const out = await exportMp3(engine, {
        segments,
        from,
        to,
        voiceId,
        pitch,
        kbps,
        splitMinutes: split,
        baseName: title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'audio',
        signal: ctl.signal,
        onProgress: setProgress,
      })
      setFiles(out.map((f) => ({ ...f, url: URL.createObjectURL(f.blob) })))
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : 'Não foi possível gerar o MP3.')
      }
    } finally {
      release()
      setRunning(false)
    }
  }

  const eta =
    progress && progress.done > 0
      ? (progress.elapsedMs / progress.done) * (progress.total - progress.done) / 1000
      : null

  return (
    <Modal
      title="Baixar em MP3"
      onClose={() => {
        abort.current?.abort()
        onClose()
      }}
      footer={
        running ? (
          <button type="button" className={btnQuiet} onClick={() => abort.current?.abort()}>
            Cancelar
          </button>
        ) : (
          <>
            <button type="button" className={btnQuiet} onClick={onClose}>
              Fechar
            </button>
            <button type="button" className={btnPrimary} onClick={() => void start()} disabled={to <= from}>
              <IconDownload /> Gerar MP3
            </button>
          </>
        )
      }
    >
      <fieldset className="mt-1" disabled={running}>
        <legend className="mb-2 font-semibold">O que baixar</legend>
        <div className="grid gap-1">
          {(
            [
              ['all', 'O PDF inteiro'],
              ['here', 'Do ponto em que estou até o fim'],
              ['pages', 'Um intervalo de páginas'],
            ] as Array<[Range, string]>
          ).map(([v, label]) => (
            <label key={v} className="flex min-h-11 items-center gap-3">
              <input type="radio" name="range" className="h-5 w-5 accent-[var(--lime)]" checked={range === v} onChange={() => setRange(v)} />
              {label}
            </label>
          ))}
        </div>
        {range === 'pages' && (
          <div className="mt-2 flex items-center gap-3">
            <label className="flex items-center gap-2">
              de
              <input type="number" min={firstPage} max={lastPage} value={p1} onChange={(e) => setP1(Number(e.target.value) || firstPage)} className="w-24 rounded-xl border border-line bg-paper px-3 py-2" />
            </label>
            <label className="flex items-center gap-2">
              até
              <input type="number" min={firstPage} max={lastPage} value={p2} onChange={(e) => setP2(Number(e.target.value) || lastPage)} className="w-24 rounded-xl border border-line bg-paper px-3 py-2" />
            </label>
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 font-semibold">
            Arquivos
            <select value={split} onChange={(e) => setSplit(Number(e.target.value))} className="rounded-xl border border-line bg-paper px-3 py-3 font-normal">
              <option value={0}>Um arquivo só</option>
              <option value={30}>Partes de 30 minutos</option>
              <option value={60}>Partes de 1 hora</option>
            </select>
          </label>
          <label className="grid gap-1 font-semibold">
            Qualidade
            <select value={kbps} onChange={(e) => setKbps(Number(e.target.value) as 64 | 96 | 128)} className="rounded-xl border border-line bg-paper px-3 py-3 font-normal">
              <option value={64}>Voz (64 kbps, menor arquivo)</option>
              <option value={96}>Boa (96 kbps)</option>
              <option value={128}>Alta (128 kbps)</option>
            </select>
          </label>
        </div>
      </fieldset>

      <p className="mt-5 rounded-2xl bg-line/40 p-4 text-sm">
        {to > from ? (
          <>
            Serão cerca de <strong>{formatDuration(seconds)}</strong> de áudio, em torno de{' '}
            <strong>{sizeMB < 10 ? sizeMB.toFixed(1) : Math.round(sizeMB)} MB</strong>. O áudio é gerado no seu
            aparelho, então leva um tempo que depende dele. Deixe esta aba aberta e a tela ligada.
          </>
        ) : (
          'Nenhum trecho nesse intervalo.'
        )}
      </p>

      {progress && running && (
        <div className="mt-4" role="status">
          <div className="h-3 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-lime transition-[width]" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {progress.done} de {progress.total} trechos
            {eta !== null && <> · faltam cerca de {formatDuration(eta)}</>}
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 font-semibold">Pronto! Baixe {files.length > 1 ? 'os arquivos' : 'o arquivo'}:</h3>
          <ul className="grid gap-2">
            {files.map((f) => (
              <li key={f.name}>
                <a href={f.url} download={f.name} className={`${btnPrimary} w-full justify-between`}>
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-sm font-medium">
                    {formatDuration(f.seconds)} · {(f.blob.size / 1_000_000).toFixed(1)} MB
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
