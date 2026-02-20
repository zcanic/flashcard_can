import { type Grade, fsrs, type Card, type CardInput, type RecordLogItem, createEmptyCard } from 'ts-fsrs'

export type ReviewResult = {
  next: Card
  log: RecordLogItem
  rating: Grade
}

const engine = fsrs()

export function createCard(now = new Date()): Card {
  return createEmptyCard(now)
}

export function reviewCard(card: CardInput | Card, rating: Grade, now = new Date()): ReviewResult {
  const scheduling = engine.repeat(card, now)
  const result = scheduling[rating]
  return { next: result.card, log: result, rating }
}
