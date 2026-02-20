import { useCallback, useEffect, useMemo, useState } from 'react'
import { db, type Deck } from '../data/db'
import { createCard } from '../fsrs/engine'

const nowIso = () => new Date().toISOString()

export function useDecks() {
  const [decks, setDecks] = useState<Deck[]>([])

  const loadDecks = useCallback(async () => {
    const items = await db.decks.orderBy('updatedAt').reverse().toArray()
    setDecks(items)
  }, [])

  const ensureStarterDeck = useCallback(async () => {
    const count = await db.decks.count()
    if (count > 0) return

    const timestamp = nowIso()
    const demoDeckId = await db.decks.add({
      name: 'Starter · 日常英语',
      hash: crypto.randomUUID(),
      isHidden: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const starters = [
      ['Good morning', '早上好'],
      ['How are you?', '你好吗？'],
      ['Thank you', '谢谢你'],
      ['See you later', '回头见'],
      ['Could you help me?', '你能帮我吗？'],
    ]
    for (const [front, back] of starters) {
      const base = createCard()
      await db.cards.add({
        deckId: demoDeckId,
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
  }, [])

  useEffect(() => {
    const bootstrap = async () => {
      await ensureStarterDeck()
      await loadDecks()
    }
    void bootstrap()
  }, [ensureStarterDeck, loadDecks])

  const createDeck = useCallback(async (name: string) => {
    const timestamp = nowIso()
    await db.decks.add({
      name,
      hash: crypto.randomUUID(),
      isHidden: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await loadDecks()
  }, [loadDecks])

  const renameDeck = useCallback(async (id: number, name: string) => {
    await db.decks.update(id, { name, updatedAt: nowIso() })
    await loadDecks()
  }, [loadDecks])

  const deleteDeck = useCallback(async (id: number) => {
    await db.transaction('rw', db.decks, db.cards, db.reviewLogs, async () => {
      await db.cards.where('deckId').equals(id).delete()
      await db.reviewLogs.where('deckId').equals(id).delete()
      await db.decks.delete(id)
    })
    await loadDecks()
  }, [loadDecks])

  const toggleDeckVisibility = useCallback(async (deck: Deck) => {
    if (!deck.id) return
    await db.decks.update(deck.id, {
      isHidden: !deck.isHidden,
      updatedAt: nowIso(),
    })
    await loadDecks()
  }, [loadDecks])

  const setAllDeckVisibility = useCallback(async (showAll: boolean) => {
    const timestamp = nowIso()
    await db.decks.toCollection().modify({
      isHidden: !showAll,
      updatedAt: timestamp,
    })
    await loadDecks()
  }, [loadDecks])

  const visibleDeckIds = useMemo(
    () => decks.filter((deck) => deck.id && !deck.isHidden).map((deck) => deck.id as number),
    [decks],
  )
  const visibleDeckCount = useMemo(() => decks.filter((deck) => !deck.isHidden).length, [decks])
  const hiddenDeckCount = decks.length - visibleDeckCount

  return {
    decks,
    visibleDeckIds,
    visibleDeckCount,
    hiddenDeckCount,
    loadDecks,
    createDeck,
    renameDeck,
    deleteDeck,
    toggleDeckVisibility,
    setAllDeckVisibility,
  }
}
