import { useEffect, useMemo, useState } from 'react'
import { goeyToast } from 'goey-toast'
import { db, type Card, type Deck } from '../data/db'
import { createCard } from '../fsrs/engine'
import MarkdownText from './MarkdownText'

type CardRow = Card & { deckName: string | null }

const nowIso = () => new Date().toISOString()

type CardManagerProps = {
  visibleDeckIds?: number[]
}

export default function CardManager({ visibleDeckIds }: CardManagerProps) {
  const [decks, setDecks] = useState<Deck[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [selectedDeckId, setSelectedDeckId] = useState<number | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [editingCardId, setEditingCardId] = useState<number | null>(null)
  const [editingFront, setEditingFront] = useState('')
  const [editingBack, setEditingBack] = useState('')

  const visibleDeckIdSet = useMemo(() => new Set(visibleDeckIds ?? []), [visibleDeckIds])
  const hasVisibilityFilter = Array.isArray(visibleDeckIds)

  useEffect(() => {
    const load = async () => {
      try {
        const deckItems = await db.decks.orderBy('updatedAt').reverse().toArray()
        setDecks(deckItems)
        const cardItems = await db.cards.orderBy('updatedAt').reverse().toArray()
        setCards(cardItems)
      } catch (error) {
        goeyToast.error('加载卡片失败', {
          description: error instanceof Error ? error.message : '数据库读取失败',
        })
      }
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

  const availableDecks = useMemo(() => {
    if (!hasVisibilityFilter) return decks
    return decks.filter((deck) => deck.id && visibleDeckIdSet.has(deck.id))
  }, [decks, hasVisibilityFilter, visibleDeckIdSet])

  useEffect(() => {
    if (selectedDeckId === 'all') return
    if (!hasVisibilityFilter) return
    if (!visibleDeckIdSet.has(selectedDeckId)) {
      setSelectedDeckId('all')
    }
  }, [hasVisibilityFilter, selectedDeckId, visibleDeckIdSet])

  const visibleCards: CardRow[] = useMemo(() => {
    return cards
      .filter((card) => (hasVisibilityFilter ? visibleDeckIdSet.has(card.deckId) : true))
      .filter((card) => (selectedDeckId === 'all' ? true : card.deckId === selectedDeckId))
      .filter((card) => {
        const trimmed = keyword.trim().toLowerCase()
        if (!trimmed) return true
        return (
          card.front.toLowerCase().includes(trimmed) ||
          card.back.toLowerCase().includes(trimmed)
        )
      })
      .map((card) => ({
        ...card,
        deckName: deckById.get(card.deckId) ?? null,
      }))
  }, [cards, deckById, hasVisibilityFilter, keyword, selectedDeckId, visibleDeckIdSet])

  const refreshCards = async () => {
    const cardItems = await db.cards.orderBy('updatedAt').reverse().toArray()
    setCards(cardItems)
  }

  const createNewCard = async () => {
    if (availableDecks.length === 0) {
      goeyToast.warning('请先创建牌组')
      return
    }
    const deckId = selectedDeckId === 'all' ? availableDecks[0].id : selectedDeckId
    if (!deckId) return
    const trimmedFront = front.trim()
    const trimmedBack = back.trim()
    if (!trimmedFront || !trimmedBack) {
      goeyToast.warning('请填写正反面内容')
      return
    }
    const base = createCard()
    const timestamp = nowIso()
    try {
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
      goeyToast.success('卡片已添加', {
        fillColor: '#f7e8ec',
        borderColor: '#e7cfd7',
        spring: true,
        bounce: 0.24,
      })
    } catch (error) {
      goeyToast.error('添加失败', {
        description: error instanceof Error ? error.message : '数据库写入失败',
      })
    }
  }

  const deleteCard = async (id?: number) => {
    if (!id) return
    try {
      await db.cards.delete(id)
      await refreshCards()
      goeyToast.info('卡片已删除', {
        fillColor: '#f8f5f2',
        borderColor: '#e5ddd6',
        spring: false,
      })
    } catch (error) {
      goeyToast.error('删除失败', {
        description: error instanceof Error ? error.message : '数据库写入失败',
      })
    }
  }

  const beginEditCard = (card: Card) => {
    if (!card.id) return
    setEditingCardId(card.id)
    setEditingFront(card.front)
    setEditingBack(card.back)
  }

  const cancelEditCard = () => {
    setEditingCardId(null)
    setEditingFront('')
    setEditingBack('')
  }

  const saveEditCard = async () => {
    if (editingCardId == null) return
    const nextFront = editingFront.trim()
    const nextBack = editingBack.trim()
    if (!nextFront || !nextBack) {
      goeyToast.warning('正反面不能为空')
      return
    }
    try {
      await db.cards.update(editingCardId, {
        front: nextFront,
        back: nextBack,
        updatedAt: nowIso(),
      })
      cancelEditCard()
      await refreshCards()
      goeyToast.success('卡片已更新')
    } catch (error) {
      goeyToast.error('更新失败', {
        description: error instanceof Error ? error.message : '数据库写入失败',
      })
    }
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
            {availableDecks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索卡片"
            className="h-10 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm"
          />
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
          {(front.trim() || back.trim()) && (
            <div className="grid gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-stone-500">预览正面</div>
                <MarkdownText content={front || '（空）'} compact />
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-stone-500">预览背面</div>
                <MarkdownText content={back || '（空）'} compact />
              </div>
            </div>
          )}
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
              {editingCardId === card.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editingFront}
                    onChange={(event) => setEditingFront(event.target.value)}
                    className="h-20 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  />
                  <textarea
                    value={editingBack}
                    onChange={(event) => setEditingBack(event.target.value)}
                    className="h-20 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  />
                  <div className="flex justify-end gap-2 text-xs">
                    <button
                      onClick={cancelEditCard}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1"
                    >
                      取消
                    </button>
                    <button
                      onClick={saveEditCard}
                      className="rounded-lg border border-rose-200 bg-rose-100 px-3 py-1"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-2">
                      <MarkdownText content={card.front} compact />
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-2">
                      <MarkdownText content={card.back} compact />
                    </div>
                    <p className="text-[11px] text-stone-500">{card.deckName ?? '未命名'} · Due {new Date(card.dueAt).toLocaleDateString()}</p>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => beginEditCard(card)}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1 text-xs text-stone-700"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => deleteCard(card.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700"
                    >
                      删除
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}
