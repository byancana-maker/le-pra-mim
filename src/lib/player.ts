// Reprodutor: gera a voz trecho a trecho (com alguns trechos de antecedência)
// e toca em sequência, avisando a tela qual trecho está sendo lido.

import type { Segment } from './segment.ts'
import type { TtsEngine } from './tts.ts'
import { floatToInt16, int16ToWavBlob } from './audio.ts'

export type PlayerStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'finished' | 'error'

export interface PlayerConfig {
  voiceId: string
  pitch: number
}

export interface PlayerState {
  index: number
  status: PlayerStatus
  speed: number
  error?: string
}

const LOOKAHEAD = 3

export class Player {
  private audio = new Audio()
  private segments: Segment[] = []
  private config: PlayerConfig = { voiceId: '', pitch: 1 }
  private urls = new Map<number, string>()
  private index = 0
  private status: PlayerStatus = 'idle'
  private speed = 1
  private error?: string
  private configEpoch = 0
  private pumping = false
  private playingIndex = -1
  private listeners = new Set<(s: PlayerState) => void>()
  private title = ''

  constructor(private engine: TtsEngine) {
    this.audio.preservesPitch = true
    this.audio.addEventListener('ended', () => this.onEnded())
    this.audio.addEventListener('error', () => {
      // ignora o "erro" gerado ao limpar a fonte
      if (!this.audio.getAttribute('src')) return
      this.fail('Não foi possível tocar o áudio deste trecho.')
    })
  }

  subscribe(fn: (s: PlayerState) => void): () => void {
    this.listeners.add(fn)
    fn(this.state())
    return () => this.listeners.delete(fn)
  }

  state(): PlayerState {
    return { index: this.index, status: this.status, speed: this.speed, error: this.error }
  }

  private emit() {
    const s = this.state()
    this.listeners.forEach((fn) => fn(s))
  }

  private set(status: PlayerStatus, error?: string) {
    this.status = status
    this.error = error
    this.emit()
  }

  private fail(message: string) {
    this.audio.pause()
    this.set('error', message)
  }

  setTitle(title: string) {
    this.title = title
  }

  load(segments: Segment[], index: number, config: PlayerConfig) {
    this.stop()
    this.segments = segments
    this.config = config
    this.index = Math.min(Math.max(index, 0), Math.max(segments.length - 1, 0))
    this.set('idle')
  }

  /** Troca de voz/tom/gênero: descarta o áudio pronto e continua de onde parou. */
  reconfigure(segments: Segment[], index: number, config: PlayerConfig) {
    const wasActive = this.status === 'playing' || this.status === 'buffering'
    this.stop()
    this.segments = segments
    this.config = config
    this.index = Math.min(Math.max(index, 0), Math.max(segments.length - 1, 0))
    this.set('idle')
    if (wasActive) this.play()
  }

  private stop() {
    this.configEpoch++
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.playingIndex = -1
    this.urls.forEach((u) => URL.revokeObjectURL(u))
    this.urls.clear()
  }

  play() {
    if (!this.segments.length) return
    if (this.status === 'finished') this.index = 0
    this.setupMediaSession()
    if (this.status === 'paused' && this.playingIndex === this.index && this.audio.src) {
      void this.audio.play().then(
        () => this.set('playing'),
        () => this.fail('O navegador bloqueou a reprodução. Toque em tocar novamente.'),
      )
      void this.pump()
      return
    }
    this.begin(this.index)
  }

  pause() {
    if (this.status !== 'playing' && this.status !== 'buffering') return
    this.audio.pause()
    this.set('paused')
  }

  toggle() {
    if (this.status === 'playing' || this.status === 'buffering') this.pause()
    else this.play()
  }

  seek(index: number) {
    const i = Math.min(Math.max(index, 0), this.segments.length - 1)
    const active = this.status === 'playing' || this.status === 'buffering'
    this.audio.pause()
    this.playingIndex = -1
    this.index = i
    if (active) this.begin(i)
    else this.set(this.status === 'finished' ? 'paused' : this.status === 'idle' ? 'idle' : 'paused')
  }

  /** Começa a tocar a partir de um trecho (clique no texto). */
  playFrom(index: number) {
    if (!this.segments.length) return
    this.audio.pause()
    this.playingIndex = -1
    this.setupMediaSession()
    this.begin(Math.min(Math.max(index, 0), this.segments.length - 1))
  }

  next() {
    this.seek(this.index + 1)
  }

  prev() {
    this.seek(this.index - 1)
  }

  setSpeed(speed: number) {
    this.speed = speed
    this.audio.playbackRate = speed
    this.emit()
  }

  private begin(i: number) {
    this.index = i
    this.set('buffering')
    const url = this.urls.get(i)
    if (url) this.startAudio(i, url)
    void this.pump()
  }

  private startAudio(i: number, url: string) {
    this.audio.src = url
    this.audio.preservesPitch = true
    this.audio.playbackRate = this.speed
    this.playingIndex = i
    this.index = i
    void this.audio.play().then(
      () => {
        if (this.playingIndex === i) this.set('playing')
      },
      () => this.fail('O navegador bloqueou a reprodução. Toque em tocar novamente.'),
    )
    this.emit()
  }

  private onEnded() {
    if (this.status !== 'playing') return
    // libera áudios que já passaram
    for (const [k, u] of this.urls) {
      if (k < this.index) {
        URL.revokeObjectURL(u)
        this.urls.delete(k)
      }
    }
    const nextIndex = this.index + 1
    if (nextIndex >= this.segments.length) {
      this.playingIndex = -1
      this.set('finished')
      return
    }
    this.index = nextIndex
    const url = this.urls.get(nextIndex)
    if (url) this.startAudio(nextIndex, url)
    else this.set('buffering')
    void this.pump()
  }

  /** Gera os próximos trechos, um de cada vez. */
  private async pump() {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.status === 'playing' || this.status === 'buffering') {
        const epoch = this.configEpoch
        let target = -1
        for (let k = 0; k <= LOOKAHEAD; k++) {
          const i = this.index + k
          if (i >= this.segments.length) break
          if (!this.urls.has(i)) {
            target = i
            break
          }
        }
        if (target < 0) break

        const seg = this.segments[target]
        const result = await this.engine.synthesize(seg.speech, {
          voiceId: this.config.voiceId,
          scales: seg.scales,
          pitch: this.config.pitch,
        })
        if (epoch !== this.configEpoch) continue // a configuração mudou enquanto gerava

        const samples = floatToInt16(result.pcm, seg.pauseMs, result.sampleRate)
        const url = URL.createObjectURL(int16ToWavBlob(samples, result.sampleRate))
        this.urls.set(target, url)

        if (this.status === 'buffering' && target === this.index) this.startAudio(target, url)
      }
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'Erro ao gerar a voz.')
    } finally {
      this.pumping = false
    }
  }

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: this.title || 'Lê pra mim', artist: 'Lê pra mim' })
      navigator.mediaSession.setActionHandler('play', () => this.play())
      navigator.mediaSession.setActionHandler('pause', () => this.pause())
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next())
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev())
    } catch {
      /* controles da tela de bloqueio são opcionais */
    }
  }

  dispose() {
    this.stop()
    this.listeners.clear()
  }
}
