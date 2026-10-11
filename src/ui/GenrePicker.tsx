import { GENRES, type Genre, type GenreId } from '../lib/genres.ts'

// Cada gênero é uma lombada de livro na estante: dá para escolher tocando na cor.
// A altura varia só para a estante parecer uma estante.
const HEIGHTS = [168, 150, 176, 158, 182, 146, 172, 162, 180, 152, 170, 156, 178, 148]

export function GenrePicker({
  value,
  onChange,
  suggestion,
}: {
  value: GenreId | null
  onChange: (id: GenreId) => void
  suggestion?: { genre: GenreId; reason: string } | null
}) {
  const selected: Genre | undefined = GENRES.find((g) => g.id === value)
  return (
    <div>
      <div className="shelf" role="group" aria-label="Gênero do texto">
        {GENRES.map((g, i) => (
          <div key={g.id} className="shelf-cell">
            <button
              type="button"
              className="spine"
              aria-pressed={value === g.id}
              aria-label={g.label}
              onClick={() => onChange(g.id)}
              style={{ background: g.color, color: g.ink, width: 46, height: HEIGHTS[i % HEIGHTS.length] }}
            >
              <span className="spine-text text-[0.95rem]">{g.label.split(' ou ')[0].split(' e ')[0]}</span>
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 min-h-[8.5rem] rounded-2xl border border-line bg-card p-5" aria-live="polite">
        {selected ? (
          <>
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 rounded-full" style={{ background: selected.color }} aria-hidden="true" />
              <h3 className="font-display text-xl font-semibold">{selected.label}</h3>
            </div>
            <p className="mt-1 text-muted">{selected.blurb}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.95rem]">
              {selected.adapt.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted">
            Toque numa lombada para escolher do que se trata o PDF. A voz muda o ritmo, as pausas e a entonação
            conforme o gênero.
            {suggestion && (
              <>
                {' '}
                <button
                  type="button"
                  className="font-semibold text-ink underline underline-offset-4"
                  onClick={() => onChange(suggestion.genre)}
                >
                  {suggestion.reason} Usar {GENRES.find((g) => g.id === suggestion.genre)?.label.toLowerCase()}
                </button>
                .
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
