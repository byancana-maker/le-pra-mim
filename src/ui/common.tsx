import { useEffect, useRef, useState, type ReactNode } from 'react'

/* ---------- Ícones ---------- */
type IconProps = { className?: string }
const base = (className?: string) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': true,
})

export const IconPlay = ({ className }: IconProps) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
)
export const IconPause = ({ className }: IconProps) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
  </svg>
)
export const IconPrev = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M6 5v14" />
    <path d="M19 6.5v11a.8.8 0 0 1-1.25.66l-8-5.5a.8.8 0 0 1 0-1.32l8-5.5A.8.8 0 0 1 19 6.5Z" />
  </svg>
)
export const IconNext = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M18 5v14" />
    <path d="M5 6.5v11a.8.8 0 0 0 1.25.66l8-5.5a.8.8 0 0 0 0-1.32l-8-5.5A.8.8 0 0 0 5 6.5Z" />
  </svg>
)
export const IconBack = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
)
export const IconSliders = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </svg>
)
export const IconDownload = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
  </svg>
)
export const IconSun = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </svg>
)
export const IconMoon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </svg>
)
export const IconPlus = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const IconSpeaker = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M4 10v4h3.5L12 18V6l-4.5 4H4Z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
)
export const IconClose = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

/* ---------- Marca ---------- */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display text-[1.65rem] font-semibold leading-none tracking-tight ${className}`}>
      <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden="true">
        <rect width="512" height="512" rx="112" fill="#12213a" />
        <rect x="104" y="150" width="64" height="212" rx="14" fill="#8bc53f" />
        <rect x="184" y="112" width="64" height="288" rx="14" fill="#e8edf5" />
        <g fill="none" stroke="#8bc53f" strokeWidth="26" strokeLinecap="round">
          <path d="M300 200c28 34 28 78 0 112" />
          <path d="M352 160c52 62 52 130 0 192" />
        </g>
      </svg>
      Lê pra mim
    </span>
  )
}

/* ---------- Equalizador ---------- */
export function Equalizer({ on }: { on: boolean }) {
  return (
    <span className="eq" data-on={on} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

/* ---------- Tema claro/escuro ---------- */
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('le-pra-mim-tema')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d1522' : '#12213a')
    try {
      localStorage.setItem('le-pra-mim-tema', theme)
    } catch {
      /* sem armazenamento: tudo bem */
    }
  }, [theme])
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }
}

export function ThemeButton({ theme, toggle }: { theme: 'light' | 'dark'; toggle: () => void }) {
  return (
    <button
      type="button"
      onClick={toggle}
      className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-line/60"
      aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
    >
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  )
}

/* ---------- Botões ---------- */
export const btnPrimary =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime px-6 font-semibold text-on-lime transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-45'
export const btnQuiet =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line px-5 font-semibold text-ink transition hover:bg-line/50 disabled:cursor-not-allowed disabled:opacity-45'

/* ---------- Diálogo ---------- */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    return () => d?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-label={title}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex items-center justify-between gap-4 px-6 pt-5 pb-3">
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-line/60"
            aria-label="Fechar"
          >
            <IconClose />
          </button>
        </header>
        <div className="overflow-y-auto px-6 pb-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">{footer}</footer>}
      </div>
    </dialog>
  )
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m > 0) return `${m} min`
  return `${s} s`
}
