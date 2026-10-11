# Lê pra mim

App web para ouvir PDFs com voz de IA. A pessoa envia o PDF, escolhe do que se trata
(artigo científico, romance, drama, ação, poesia…) e a leitura se adapta ao gênero.
Dá para ouvir na hora ou baixar em MP3.

Tudo roda no navegador, sem servidor e sem chave de API: pode ser hospedado de graça.
Os PDFs ficam salvos só no navegador de quem usa (IndexedDB).

## Stack
React + Vite + TypeScript + Tailwind, PWA instalável. Mesma família do Planejamento em Mãos
e do Conecta Gávea (paleta navy/verde-limão).

- **PDF**: pdf.js (build legacy), com leitura de duas colunas, remoção de cabeçalho/rodapé e
  separação de parágrafos (`src/lib/pdf-text.ts`).
- **Vozes avançadas**: [Supertonic 3](https://huggingface.co/supertone-oss-archive/supertonic-3) (10 estilos, F1–F5 e M1–M5; licença OpenRAIL-M), rodando no navegador. Um download de algumas centenas de MB libera as dez. Qualidade ainda não ouvida pela autora do código: confirme ouvindo.
- **Vozes leves**: [Piper](https://github.com/rhasspy/piper) em WebAssembly (ONNX Runtime Web + espeak-ng),
  vozes pt-BR. Os modelos (~60 MB por voz) são baixados do Hugging Face na primeira vez e ficam
  no cache do navegador.
- **Gêneros**: `src/lib/genres.ts`. Cada gênero define ritmo, variação de entonação, pausas,
  tratamento de falas (travessão/aspas) e se pula citações e referências.
- **MP3**: lamejs, gerado trecho a trecho (não guarda o áudio bruto na memória).

## Rodar
```
npm install
npm run dev        # desenvolvimento
npm test           # testa leitura de PDF, frases e perfis de gênero
npm run build      # gera a pasta dist/
```

## Publicar de graça
Suba a pasta `dist/` em qualquer um destes (todos têm plano gratuito):
Cloudflare Pages, Netlify, GitHub Pages ou Firebase Hosting (`firebase deploy --only hosting`,
já há um `firebase.json`). O site usa caminhos relativos, então funciona também em subpasta.

## Limites conhecidos
- PDF escaneado (só imagem) não tem texto para ler: é preciso fazer OCR antes.
- As vozes pt-BR do Piper são naturais, mas não têm o nível de vozes pagas. A adaptação ao
  gênero muda ritmo, pausas e entonação; não é interpretação de ator.
- Gerar MP3 de um livro inteiro leva horas, porque a voz é gerada no aparelho.
- Em celular, a aba precisa ficar aberta e com a tela ligada durante a exportação.
