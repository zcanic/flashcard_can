import initSqlJs from 'sql.js'
import { BlobReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'
import { db } from '../data/db'
import { createCard } from '../fsrs/engine'

type AnkiMediaMap = Record<string, string>

const nowIso = () => new Date().toISOString()

const textDecoder = new TextDecoder('utf-8')

async function parseAnkiDb(sqliteBuffer: Uint8Array) {
  const SQL = await initSqlJs({
    locateFile: (file) => `/node_modules/sql.js/dist/${file}`,
  })
  return new SQL.Database(sqliteBuffer)
}

export async function importApkg(file: File) {
  const reader = new ZipReader(new BlobReader(file))
  const entries = await reader.getEntries()
  const dbEntry = entries.find((entry) => entry.filename === 'collection.anki2')
  if (!dbEntry) throw new Error('Missing collection.anki2')
  const sqliteBytes = new Uint8Array(await dbEntry.getData?.(new Uint8ArrayWriter()))
  const database = await parseAnkiDb(sqliteBytes)

  const mediaEntry = entries.find((entry) => entry.filename === 'media')
  let mediaMap: AnkiMediaMap = {}
  if (mediaEntry) {
    const mediaBytes = new Uint8Array(await mediaEntry.getData?.(new Uint8ArrayWriter()))
    mediaMap = JSON.parse(textDecoder.decode(mediaBytes))
  }
  await reader.close()

  const colResult = database.exec('select decks from col')
  const deckBlob = colResult[0]?.values?.[0]?.[0]
  const deckJson = deckBlob ? JSON.parse(deckBlob as string) : {}

  const notesResult = database.exec('select id, flds, mid, sfld from notes')
  const cardsResult = database.exec('select id, nid, did from cards')

  const noteMap = new Map<number, { flds: string; sfld: string }>()
  if (notesResult[0]) {
    notesResult[0].values.forEach((row) => {
      const [id, flds, , sfld] = row as [number, string, number, string]
      noteMap.set(id, { flds, sfld })
    })
  }

  const deckIdMap = new Map<number, number>()
  const timestamp = nowIso()
  for (const [ankiDeckId, deckData] of Object.entries(deckJson)) {
    const name = (deckData as { name?: string }).name ?? 'Imported'
    const localId = await db.decks.add({
      name,
      hash: crypto.randomUUID(),
      isHidden: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    deckIdMap.set(Number(ankiDeckId), localId)
  }

  if (cardsResult[0]) {
    for (const row of cardsResult[0].values) {
      const [, nid, did] = row as [number, number, number]
      const deckId = deckIdMap.get(did)
      const note = noteMap.get(nid)
      if (!deckId || !note) continue
      const fields = note.flds.split('\u001f')
      const front = fields[0] ?? note.sfld
      const back = fields[1] ?? ''
      const base = createCard()
      await db.cards.add({
        deckId,
        front,
        back,
        dueAt: base.due.toISOString(),
        stability: base.stability,
        difficulty: base.difficulty,
        elapsedDays: base.elapsed_days,
        scheduledDays: base.scheduled_days,
        learningSteps: base.learning_steps,
        reps: base.reps,
        lapses: base.lapses,
        state: base.state,
        lastReviewedAt: base.last_review ? base.last_review.toISOString() : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
  }

  return { mediaMap, decksImported: deckIdMap.size }
}
