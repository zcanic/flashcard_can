import { useEffect, useMemo, useState } from 'react'
import { db, type Card, type Deck } from '../data/db'
import { createCard } from '../fsrs/engine'

type CardRow = Card & { deckName: string | null }

const nowIso = () => new Date().toISOString()

export default function CardManager() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [selectedDeckId, setSelectedDeckId] = useState<number | 'all'>('all')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')

  useEffect(() => {
    const load = async () => {
      const deckItems = await db.decks.orderBy('updatedAt').reverse().toArray()
      setDecks(deckItems)
      const cardItems = await db.cards.orderBy('updatedAt').reverse().toArray()
      setCards(cardItems)
    }
    load()
  }, [])

  const deckById = useMemo(() => {
    const map = new Map<number, string>()
    decks.forEach((deck) => {
      if (deck.id) map.set(deck.id, deck.name)
    })
    return map
  }, [decks])

  const visibleCards: CardRow[] = useMemo(() => {
    return cards
      .filter((card) => (selectedDeckId === 'all' ? true : card.deckId === selectedDeckId))
      .map((card) => ({
        ...card,
        deckName: deckById.get(card.deckId) ?? null,
      }))
  }, [cards, deckById, selectedDeckId])

  const refreshCards = async () => {
    const cardItems = await db.cards.orderBy('updatedAt').reverse().toArray()
    setCards(cardItems)
  }

  const createNewCard = async () => {
    if (decks.length === 0) return
    const deckId = selectedDeckId === 'all' ? decks[0].id : selectedDeckId
    if (!deckId) return
    const trimmedFront = front.trim()
    const trimmedBack = back.trim()
    if (!trimmedFront || !trimmedBack) return
    const base = createCard()
    const timestamp = nowIso()
    await db.cards.add({
      deckId,
      front: trimmedFront,
      back: trimmedBack,
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
    setFront('')
    setBack('')
    await refreshCards()
  }

  const deleteCard = async (id?: number) => {
    if (!id) return
    await db.cards.delete(id)
    await refreshCards()
  }

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-800">卡片</h2>
        <p className="text-xs text-stone-500">在这里添加和维护卡片内容。</p>
      </header>

      <div className="rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm">
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            value={selectedDeckId}
            onChange={(event) =>
              setSelectedDeckId(event.target.value === 'all' ? 'all' : Number(event.target.value))
            }
            className="h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm"
          >
            <option value="all">全部牌组</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
          <span className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-stone-500">
            {visibleCards.length} 张
          </span>
        </div>
        <div className="mt-3 space-y-2">
          <textarea
            value={front}
            onChange={(event) => setFront(event.target.value)}
            placeholder="正面（Markdown）"
            className="h-20 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <textarea
            value={back}
            onChange={(event) => setBack(event.target.value)}
            placeholder="背面（Markdown）"
            className="h-20 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={createNewCard}
            className="h-11 w-full rounded-xl border border-rose-200 bg-rose-100/70 text-sm font-medium text-stone-700"
          >
            添加卡片
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {visibleCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/50 p-6 text-center text-sm text-stone-500">
            暂无卡片。
          </div>
        ) : (
          visibleCards.map((card) => (
            <div key={card.id} className="rounded-2xl border border-stone-200 bg-white/75 p-4 shadow-sm">
              <div className="space-y-1">
                <p className="text-sm font-medium text-stone-800">{card.front}</p>
                <p className="text-xs text-stone-600">{card.back}</p>
                <p className="text-[11px] text-stone-500">{card.deckName ?? '未命名'} · Due {new Date(card.dueAt).toLocaleDateString()}</p>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => deleteCard(card.id)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700"
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
