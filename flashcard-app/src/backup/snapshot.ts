import { db, type Card, type Deck, type ReviewLog } from '../data/db'

export type BackupSnapshot = {
  version: 1
  exportedAt: string
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
}

function assertArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid backup format: ${name} must be an array`)
  }
}

export async function createBackupSnapshot(): Promise<BackupSnapshot> {
  const [decks, cards, reviewLogs] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
  ])

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    decks,
    cards,
    reviewLogs,
  }
}

export async function restoreBackupSnapshot(
  payload: unknown,
  mode: 'replace' | 'merge' = 'replace',
): Promise<{ decks: number; cards: number; reviewLogs: number }> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid backup payload')
  }

  const candidate = payload as Partial<BackupSnapshot>
  assertArray(candidate.decks, 'decks')
  assertArray(candidate.cards, 'cards')
  assertArray(candidate.reviewLogs, 'reviewLogs')

  const decks = candidate.decks as Deck[]
  const cards = candidate.cards as Card[]
  const reviewLogs = candidate.reviewLogs as ReviewLog[]

  await db.transaction('rw', db.decks, db.cards, db.reviewLogs, async () => {
    if (mode === 'replace') {
      await db.reviewLogs.clear()
      await db.cards.clear()
      await db.decks.clear()
    }

    if (decks.length > 0) await db.decks.bulkPut(decks)
    if (cards.length > 0) await db.cards.bulkPut(cards)
    if (reviewLogs.length > 0) await db.reviewLogs.bulkPut(reviewLogs)
  })

  return {
    decks: decks.length,
    cards: cards.length,
    reviewLogs: reviewLogs.length,
  }
}
