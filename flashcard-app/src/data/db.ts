import Dexie from 'dexie'

export type Deck = {
  id?: number
  name: string
  hash: string
  isHidden: boolean
  createdAt: string
  updatedAt: string
}

export type Card = {
  id?: number
  deckId: number
  front: string
  back: string
  dueAt: string
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: number
  lastReviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ReviewLog = {
  id?: number
  cardId: number
  deckId: number
  rating: number
  reviewedAt: string
  scheduledAt: string
  elapsedDays: number
  scheduledDays: number
  stability: number
  difficulty: number
}

class FlashcardDB extends Dexie {
  decks!: Dexie.Table<Deck, number>
  cards!: Dexie.Table<Card, number>
  reviewLogs!: Dexie.Table<ReviewLog, number>

  constructor() {
    super('flashcard')
    this.version(1).stores({
      decks: '++id,hash,updatedAt',
      cards: '++id,deckId,dueAt,updatedAt',
      reviewLogs: '++id,cardId,deckId,reviewedAt',
    })
    this.version(2)
      .stores({
        decks: '++id,hash,isHidden,updatedAt',
        cards: '++id,deckId,dueAt,updatedAt',
        reviewLogs: '++id,cardId,deckId,reviewedAt',
      })
      .upgrade((tx) =>
        tx
          .table('decks')
          .toCollection()
          .modify((deck) => {
            if (deck.isHidden === undefined) {
              deck.isHidden = false
            }
          }),
      )
  }
}

export const db = new FlashcardDB()
