import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { BlobReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'
import type { Entry, FileEntry } from '@zip.js/zip.js'
import type {
  ImportWorkerRequest,
  ImportWorkerResponse,
  ParsedCard,
  ParsedDeck,
} from './workerTypes'

const textDecoder = new TextDecoder('utf-8')

function toFileEntry(entry: Entry | undefined): FileEntry | null {
  if (!entry || entry.directory) return null
  return entry
}

function postMessageSafe(message: ImportWorkerResponse) {
  self.postMessage(message)
}

self.onmessage = async (event: MessageEvent<ImportWorkerRequest>) => {
  const payload = event.data
  if (payload.type !== 'parse-apkg') return

  const reader = new ZipReader(new BlobReader(new Blob([payload.buffer])))
  let database: { exec: (sql: string) => { values: unknown[][] }[]; close?: () => void } | null = null

  try {
    const entries = await reader.getEntries()
    const dbEntry = toFileEntry(entries.find((entry) => entry.filename === 'collection.anki2'))
    if (!dbEntry) throw new Error('Missing collection.anki2')

    const sqliteBytes = await dbEntry.getData(new Uint8ArrayWriter())
    const SQL = await initSqlJs({
      locateFile: () => sqlWasmUrl,
    })
    const dbInstance = new SQL.Database(sqliteBytes)
    database = dbInstance

    const mediaEntry = toFileEntry(entries.find((entry) => entry.filename === 'media'))
    let mediaMap: Record<string, string> = {}
    if (mediaEntry) {
      const mediaBytes = await mediaEntry.getData(new Uint8ArrayWriter())
      mediaMap = JSON.parse(textDecoder.decode(mediaBytes)) as Record<string, string>
    }

    const colResult = dbInstance.exec('select decks from col')
    const deckBlob = colResult[0]?.values?.[0]?.[0]
    const deckText = typeof deckBlob === 'string' ? deckBlob : null
    const deckJson: Record<string, { name?: string }> = deckText ? JSON.parse(deckText) : {}

    const notesResult = dbInstance.exec('select id, flds, mid, sfld from notes')
    const cardsResult = dbInstance.exec('select id, nid, did from cards')

    const noteMap = new Map<number, { flds: string; sfld: string }>()
    if (notesResult[0]) {
      notesResult[0].values.forEach((row: unknown[]) => {
        const [id, flds, , sfld] = row as [number, string, number, string]
        noteMap.set(id, { flds, sfld })
      })
    }

    const parsedDecks: ParsedDeck[] = Object.entries(deckJson).map(([ankiDeckId, deckData]) => ({
      ankiDeckId: Number(ankiDeckId),
      name: deckData.name ?? 'Imported',
    }))

    const parsedCards: ParsedCard[] = []
    if (cardsResult[0]) {
      for (const row of cardsResult[0].values) {
        const [, nid, did] = row as [number, number, number]
        const note = noteMap.get(nid)
        if (!note) continue
        const fields = note.flds.split('\u001f')
        parsedCards.push({
          ankiDeckId: did,
          front: fields[0] ?? note.sfld,
          back: fields[1] ?? '',
        })
      }
    }

    postMessageSafe({
      type: 'success',
      payload: {
        mediaMap,
        decks: parsedDecks,
        cards: parsedCards,
      },
    })
  } catch (error) {
    postMessageSafe({
      type: 'error',
      message: error instanceof Error ? error.message : 'Import parse failed',
    })
  } finally {
    await reader.close()
    database?.close?.()
  }
}

export {}
