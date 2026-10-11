// Biblioteca guardada só no navegador (IndexedDB). Nada sai do aparelho.

import { createStore, del, get, set, values } from 'idb-keyval'
import type { GenreId } from './genres.ts'

export interface DocMeta {
  id: string
  title: string
  fileName: string
  genre: GenreId
  voiceId: string
  tone: 'grave' | 'natural' | 'agudo'
  speed: number
  skipCitations: boolean
  skipReferences: boolean
  pageCount: number
  words: number
  /** posição de leitura (índice do trecho) e total de trechos na última leitura */
  position: number
  totalSegments: number
  createdAt: number
  updatedAt: number
}

const metaStore = createStore('le-pra-mim-meta', 'docs')
const bodyStore = createStore('le-pra-mim-corpo', 'docs')

export async function listDocs(): Promise<DocMeta[]> {
  const all = (await values(metaStore)) as DocMeta[]
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getMeta(id: string): Promise<DocMeta | undefined> {
  return get<DocMeta>(id, metaStore)
}

export async function saveDoc(meta: DocMeta, pages: string[][]): Promise<void> {
  await set(meta.id, pages, bodyStore)
  await set(meta.id, meta, metaStore)
}

export async function loadPages(id: string): Promise<string[][] | undefined> {
  return get<string[][]>(id, bodyStore)
}

export async function updateMeta(id: string, patch: Partial<DocMeta>): Promise<DocMeta | undefined> {
  const cur = await get<DocMeta>(id, metaStore)
  if (!cur) return undefined
  const next = { ...cur, ...patch, updatedAt: Date.now() }
  await set(id, next, metaStore)
  return next
}

export async function removeDoc(id: string): Promise<void> {
  await del(id, metaStore)
  await del(id, bodyStore)
}

export function newId(): string {
  return crypto.randomUUID()
}
