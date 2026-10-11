import { useEffect, useRef, useState } from 'react'
import type { Genre } from '../lib/genres.ts'
import { qualityLabel, TONES, toneById, type Tone, type VoiceDef } from '../lib/voices.ts'
import type { TtsEngine } from '../lib/tts.ts'
import { floatToInt16, int16ToWavBlob } from '../lib/audio.ts'
import { Equalizer, IconPlay } from './common.tsx'

export function VoicePicker({
  engine,
  voices,
  voiceId,
  tone,
  genre,
  onVoice,
  onTone,
}: {
  engine: TtsEngine
  voices: VoiceDef[]
  voiceId: string
  tone: Tone['id']
  genre: Genre
  onVoice: (id: string) => void
  onTone: (id: Tone['id']) => void
}) {
  const [busy, setBusy] = useState<string | null>(null) // voz gerando amostra
  const [playing, setPlaying] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ voiceId: string; pct: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(
    () =>
      engine.onDownloadProgress((p) => {
        const pct = p.total > 0 ? Math.min(100, Math.round((p.loaded / p.total) * 100)) : 0
        setProgress(pct >= 100 ? null : { voiceId: p.voiceId, pct })
      }),
    [engine],
  )

  useEffect(
    () => () => {
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const stop = () => {
    audioRef.current?.pause()
    setPlaying(null)
  }

  const sample = async (id: string) => {
    if (playing === id) return stop()
    stop()
    setError(null)
    setBusy(id)
    onVoice(id)
    try {
      const res = await engine.synthesize(genre.sample, {
        voiceId: id,
        scales: genre.narration,
        pitch: toneById(tone).pitch,
      })
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = URL.createObjectURL(int16ToWavBlob(floatToInt16(res.pcm), res.sampleRate))
      const a = audioRef.current ?? (audioRef.current = new Audio())
      a.src = urlRef.current
      a.onended = () => setPlaying(null)
      await a.play()
      setPlaying(id)
    } catch (e) {
      setError(
        e instanceof Error && /baixar|fetch|network/i.test(e.message)
          ? 'Não foi possível baixar a voz. Confira a conexão com a internet e tente de novo.'
          : 'Não foi possível gerar a amostra. Tente de novo ou escolha outra voz.',
      )
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const advanced = voices.filter((v) => v.engine === 'supertonic')
  const classic = voices.filter((v) => v.engine !== 'supertonic')

  const renderList = (list: VoiceDef[], label: string) => (
    <ul className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={label}>
        {list.map((v) => {
          const active = v.id === voiceId
          const loading = busy === v.id
          const dl = progress?.voiceId === v.id ? progress.pct : null
          return (
            <li key={v.id}>
              <div
                className={`flex items-center gap-3 rounded-2xl border p-3 pr-4 transition ${
                  active ? 'border-lime bg-card ring-2 ring-lime' : 'border-line bg-card'
                }`}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onVoice(v.id)}
                  className="min-h-12 flex-1 rounded-xl px-2 text-left"
                >
                  <span className="block font-display text-lg font-semibold">{v.name}</span>
                  <span className="block text-sm text-muted">
                    {v.note ?? qualityLabel(v.quality)} · baixa {v.engine === 'supertonic' ? 'umas centenas de MB' : `~${v.approxMB} MB`} na primeira vez
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void sample(v.id)}
                  disabled={busy !== null && !loading}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime text-on-lime disabled:opacity-45"
                  aria-label={playing === v.id ? `Parar amostra de ${v.name}` : `Ouvir amostra de ${v.name}`}
                >
                  {loading ? (
                    <span className="text-xs font-bold">{dl !== null ? `${dl}%` : '…'}</span>
                  ) : playing === v.id ? (
                    <Equalizer on />
                  ) : (
                    <IconPlay />
                  )}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
  )

  return (
    <div>
      {advanced.length > 0 && (
        <section>
          <h3 className="mb-1 font-display text-lg font-semibold">Vozes avançadas</h3>
          <p className="mb-3 text-sm text-muted">
            Mais naturais e expressivas. Um único download libera as dez; depois ficam salvas no navegador. Pedem um
            aparelho razoável: em celulares mais fracos a geração pode ser lenta.
          </p>
          {renderList(advanced, 'Vozes avançadas')}
        </section>
      )}
      {classic.length > 0 && (
        <section className={advanced.length ? 'mt-6' : ''}>
          <h3 className="mb-1 font-display text-lg font-semibold">Vozes leves</h3>
          <p className="mb-3 text-sm text-muted">Mais simples, mas rápidas e boas para aparelhos mais fracos.</p>
          {renderList(classic, 'Vozes leves')}
        </section>
      )}

      {progress && (
        <p className="mt-3 text-sm text-muted" role="status">
          Baixando a voz… {progress.pct}%. Isso acontece só uma vez; depois ela fica salva neste navegador.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      )}

      <fieldset className="mt-5">
        <legend className="mb-2 font-semibold">Tom da voz</legend>
        <div className="inline-flex rounded-full border border-line bg-card p-1" role="radiogroup">
          {TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tone === t.id}
              onClick={() => onTone(t.id)}
              className={`min-h-11 rounded-full px-5 font-semibold transition ${
                tone === t.id ? 'bg-ink text-paper' : 'text-ink hover:bg-line/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
