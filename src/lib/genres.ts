// Perfis de leitura por gênero.
// Os três números de cada perfil são os parâmetros do Piper:
//   length  → ritmo (maior = mais devagar)
//   noise   → variação de entonação (maior = mais "atuada")
//   noiseW  → variação do ritmo entre sílabas/pausas
// As pausas são em milissegundos e são somadas ao final de cada trecho.

export type GenreId =
  | 'cientifico'
  | 'tecnico'
  | 'didatico'
  | 'negocios'
  | 'biografia'
  | 'romance'
  | 'drama'
  | 'acao'
  | 'suspense'
  | 'fantasia'
  | 'comedia'
  | 'infantil'
  | 'poesia'
  | 'outro'

export interface Scales {
  noise: number
  length: number
  noiseW: number
}

export interface Pauses {
  sentence: number
  paragraph: number
  heading: number
  dialogue: number
  line: number
}

export interface Genre {
  id: GenreId
  label: string
  group: 'nao-ficcao' | 'ficcao'
  /** cor da lombada */
  color: string
  /** cor do texto sobre a lombada */
  ink: string
  blurb: string
  /** o que muda na leitura, em linguagem de quem ouve */
  adapt: string[]
  narration: Scales
  dialogue: Scales
  heading: Scales
  pauses: Pauses
  skipCitations: boolean
  skipReferences: boolean
  /** poesia: cada quebra de linha vira uma pausa */
  respectLines: boolean
  /** frase usada na amostra de voz */
  sample: string
}

const s = (noise: number, length: number, noiseW: number): Scales => ({ noise, length, noiseW })

export const GENRES: Genre[] = [
  {
    id: 'cientifico',
    label: 'Artigo ou livro científico',
    group: 'nao-ficcao',
    color: '#2b6e8a',
    ink: '#ffffff',
    blurb: 'Para papers, teses e livros acadêmicos.',
    adapt: [
      'Ritmo um pouco mais lento e entonação contida',
      'Pula citações como (Silva et al., 2020) e [12]',
      'Para de ler quando chega nas Referências',
      'Lê "Fig." como "Figura" e "et al." como "e colaboradores"',
    ],
    narration: s(0.5, 1.06, 0.6),
    dialogue: s(0.5, 1.06, 0.6),
    heading: s(0.45, 1.12, 0.5),
    pauses: { sentence: 220, paragraph: 650, heading: 950, dialogue: 220, line: 220 },
    skipCitations: true,
    skipReferences: true,
    respectLines: false,
    sample: 'Os resultados indicam que a variação observada não é explicada apenas pelo tamanho da amostra.',
  },
  {
    id: 'tecnico',
    label: 'Manual ou texto técnico',
    group: 'nao-ficcao',
    color: '#55657d',
    ink: '#ffffff',
    blurb: 'Para manuais, normas, documentação e relatórios.',
    adapt: [
      'Voz clara, firme e sem exageros',
      'Pausas curtas entre as frases',
      'Pula citações e referências',
    ],
    narration: s(0.5, 1.02, 0.6),
    dialogue: s(0.5, 1.02, 0.6),
    heading: s(0.45, 1.08, 0.5),
    pauses: { sentence: 200, paragraph: 550, heading: 850, dialogue: 200, line: 200 },
    skipCitations: true,
    skipReferences: true,
    respectLines: false,
    sample: 'Antes de iniciar a operação, confirme se todos os equipamentos estão desligados e sinalizados.',
  },
  {
    id: 'didatico',
    label: 'Estudo e didático',
    group: 'nao-ficcao',
    color: '#3f8f4f',
    ink: '#ffffff',
    blurb: 'Para apostilas, resumos e material de prova.',
    adapt: [
      'Ritmo mais lento para dar tempo de absorver',
      'Pausas mais longas entre os parágrafos',
      'Pula citações',
    ],
    narration: s(0.55, 1.1, 0.7),
    dialogue: s(0.55, 1.1, 0.7),
    heading: s(0.5, 1.15, 0.6),
    pauses: { sentence: 300, paragraph: 800, heading: 1100, dialogue: 300, line: 300 },
    skipCitations: true,
    skipReferences: false,
    respectLines: false,
    sample: 'Vamos por partes: primeiro entendemos o conceito, depois resolvemos um exemplo.',
  },
  {
    id: 'negocios',
    label: 'Negócios e autoajuda',
    group: 'nao-ficcao',
    color: '#a56a16',
    ink: '#ffffff',
    blurb: 'Para livros de carreira, finanças, hábitos e liderança.',
    adapt: [
      'Tom conversado e ritmo natural',
      'Um pouco mais de variação de entonação',
    ],
    narration: s(0.667, 0.98, 0.8),
    dialogue: s(0.7, 0.96, 0.85),
    heading: s(0.6, 1.08, 0.7),
    pauses: { sentence: 240, paragraph: 650, heading: 950, dialogue: 220, line: 240 },
    skipCitations: false,
    skipReferences: false,
    respectLines: false,
    sample: 'O segredo não é ter mais disciplina, e sim tornar a escolha certa a mais fácil de fazer.',
  },
  {
    id: 'biografia',
    label: 'Biografia e história',
    group: 'nao-ficcao',
    color: '#8b5e3c',
    ink: '#ffffff',
    blurb: 'Para biografias, memórias e livros de história.',
    adapt: [
      'Narração calma, de contador de histórias',
      'Pausas marcadas entre os parágrafos',
    ],
    narration: s(0.65, 1.02, 0.8),
    dialogue: s(0.7, 0.98, 0.85),
    heading: s(0.6, 1.1, 0.7),
    pauses: { sentence: 260, paragraph: 700, heading: 1000, dialogue: 220, line: 260 },
    skipCitations: false,
    skipReferences: false,
    respectLines: false,
    sample: 'Naquele inverno, a família deixou a fazenda e seguiu viagem rumo ao litoral.',
  },
  {
    id: 'romance',
    label: 'Romance',
    group: 'ficcao',
    color: '#c9456b',
    ink: '#ffffff',
    blurb: 'Para histórias de amor e relações.',
    adapt: [
      'Narração suave e envolvente',
      'Falas (com travessão ou aspas) ficam mais soltas e naturais',
      'Pausas maiores entre as cenas',
    ],
    narration: s(0.7, 1.0, 0.85),
    dialogue: s(0.8, 0.95, 1.0),
    heading: s(0.6, 1.1, 0.7),
    pauses: { sentence: 260, paragraph: 700, heading: 1100, dialogue: 180, line: 260 },
    skipCitations: false,
    skipReferences: false,
    respectLines: false,
    sample: 'Ela hesitou na porta, olhou para trás uma última vez e sorriu sem saber por quê.',
  },
  {
    id: 'drama',
    label: 'Drama',
    group: 'ficcao',
    color: '#7b3f8f',
    ink: '#ffffff',
    blurb: 'Para histórias intensas, familiares e emocionais.',
    adapt: [
      'Ritmo mais lento e pesado',
      'Entonação mais variada nas falas',
      'Silêncios longos entre as cenas',
    ],
    narration: s(0.72, 1.08, 0.95),
    dialogue: s(0.8, 1.04, 1.0),
    heading: s(0.65, 1.15, 0.8),
    pauses: { sentence: 380, paragraph: 900, heading: 1300, dialogue: 260, line: 380 },
    skipCitations: false,
    skipReferences: false,
    respectLines: false,
    sample: 'Ninguém disse nada. O relógio da sala continuou batendo, indiferente a tudo.',
  },
  {
    id: 'acao',
    label: 'Ação e aventura',
    group: 'ficcao',
    color: '#cc4f20',
    ink: '#ffffff',
    blurb: 'Para perseguições, batalhas e histórias aceleradas.',
    adapt: [
      'Ritmo mais rápido',
      'Pausas curtas para manter a tensão',
      'Falas ainda mais rápidas',
    ],
    narration: s(0.75, 0.9, 0.9),
    dialogue: s(0.8, 0.88, 0.95),
    heading: s(0.65, 1.0, 0.8),
    pauses: { sentence: 140, paragraph: 450, heading: 800, dialogue: 110, line: 140 },
    skipCitations: false,
    skipReferences: false,
    respectLines: false,
    sample: 'O motor rugiu, os pneus gritaram no asfalto e o carro disparou pela avenida.',
  },
  {
    id: 'suspense',
    label: 'Suspense e terror',
    group: 'ficcao',
    color: '#3b3a52',
    ink: '#ffffff',
    blurb: 'Para mistério, policial, thriller e histórias de medo.',
    adapt: [
      'Ritmo lento e voz mais contida',
      'Pausas longas antes das revelações',
    ],
    narration: s(0.6, 1.1, 0.9),
    dialogue: s(0.65, 1.05, 0.95),
    heading: s(0.55, 1.15, 0.8),
    pauses: { sentence: 450, paragraph: 1000, heading: 1400, dialogue: 320, line: 450 },
    skipCitations: false,
    skipReferences: false,
    respectLines: false,
    sample: 'A luz do corredor piscou duas vezes. Depois, a casa inteira ficou em silêncio.',
  },
  {
    id: 'fantasia',
    label: 'Fantasia e ficção científica',
    group: 'ficcao',
    color: '#5566d6',
    ink: '#ffffff',
    blurb: 'Para mundos inventados, magia, naves e futuros.',
    adapt: [
      'Narração épica, num ritmo constante',
      'Falas com mais variação de entonação',
    ],
    narration: s(0.7, 1.02, 0.85),
    dialogue: s(0.75, 1.0, 0.95),
    heading: s(0.6, 1.1, 0.75),
    pauses: { sentence: 280, paragraph: 750, heading: 1100, dialogue: 200, line: 280 },
    skipCitations: false,
    skipReferences: false,
    respectLines: false,
    sample: 'Além das montanhas de cristal, a última nave aguardava o sinal do velho mago.',
  },
  {
    id: 'comedia',
    label: 'Comédia e humor',
    group: 'ficcao',
    color: '#e3a91f',
    ink: '#1b1b1b',
    blurb: 'Para crônicas, sátiras e histórias leves.',
    adapt: [
      'Ritmo ligeiro e entonação bem solta',
      'Pausas curtas para o timing da piada',
    ],
    narration: s(0.8, 0.95, 1.0),
    dialogue: s(0.85, 0.92, 1.1),
    heading: s(0.7, 1.0, 0.9),
    pauses: { sentence: 200, paragraph: 600, heading: 900, dialogue: 150, line: 200 },
    skipCitations: false,
    skipReferences: false,
    respectLines: false,
    sample: 'Ele jurava que era só um cochilo rápido, mas já tinha perdido o almoço e o aniversário da sogra.',
  },
  {
    id: 'infantil',
    label: 'Infantil',
    group: 'ficcao',
    color: '#1b8a84',
    ink: '#ffffff',
    blurb: 'Para contos, fábulas e histórias de dormir.',
    adapt: [
      'Ritmo calmo e voz expressiva',
      'Pausas generosas entre as frases',
    ],
    narration: s(0.8, 1.1, 1.0),
    dialogue: s(0.85, 1.05, 1.1),
    heading: s(0.75, 1.15, 0.9),
    pauses: { sentence: 400, paragraph: 900, heading: 1200, dialogue: 300, line: 400 },
    skipCitations: false,
    skipReferences: false,
    respectLines: false,
    sample: 'Era uma vez um coelhinho que tinha medo do escuro, mas adorava olhar as estrelas.',
  },
  {
    id: 'poesia',
    label: 'Poesia',
    group: 'ficcao',
    color: '#7f6cb0',
    ink: '#ffffff',
    blurb: 'Para poemas, versos e letras.',
    adapt: [
      'Cada verso vira uma respiração',
      'Ritmo lento e pausas longas entre as estrofes',
    ],
    narration: s(0.6, 1.15, 0.7),
    dialogue: s(0.6, 1.15, 0.7),
    heading: s(0.55, 1.2, 0.6),
    pauses: { sentence: 500, paragraph: 1100, heading: 1400, dialogue: 500, line: 450 },
    skipCitations: false,
    skipReferences: false,
    respectLines: true,
    sample: 'No meio do caminho havia uma pedra, e o vento passava devagar.',
  },
  {
    id: 'outro',
    label: 'Outro',
    group: 'nao-ficcao',
    color: '#6b7280',
    ink: '#ffffff',
    blurb: 'Quando nenhum dos outros combina.',
    adapt: ['Leitura neutra, com os ajustes padrão da voz'],
    narration: s(0.667, 1.0, 0.8),
    dialogue: s(0.7, 0.98, 0.85),
    heading: s(0.6, 1.08, 0.7),
    pauses: { sentence: 250, paragraph: 650, heading: 950, dialogue: 220, line: 250 },
    skipCitations: false,
    skipReferences: false,
    respectLines: false,
    sample: 'Este é um exemplo de como a voz vai ler o seu documento.',
  },
]

export const GENRE_BY_ID: Record<GenreId, Genre> = Object.fromEntries(
  GENRES.map((g) => [g.id, g]),
) as Record<GenreId, Genre>

export function getGenre(id: string): Genre {
  return GENRE_BY_ID[id as GenreId] ?? GENRE_BY_ID.outro
}
