import { useCallback, useEffect, useMemo, useState } from 'react'
import { db, type Card } from '../data/db'
import { reviewCard } from '../fsrs/engine'
import { Rating, type CardInput, type Grade } from 'ts-fsrs'

type StudyViewProps = {
  deckId?: number
  visibleDeckIds?: number[]
}

const ratingLabels: Array<{ value: Grade; label: string; tone: string }> = [
  { value: Rating.Again, label: 'Again', tone: 'text-rose-700' },
  { value: Rating.Hard, label: 'Hard', tone: 'text-stone-600' },
  { value: Rating.Good, label: 'Good', tone: 'text-stone-800' },
  { value: Rating.Easy, label: 'Easy', tone: 'text-teal-700' },
]

export default function StudyView({ deckId, visibleDeckIds }: StudyViewProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reveal, setReveal] = useState(false)
  const [sessionReviewed, setSessionReviewed] = useState(0)
  const [lastRating, setLastRating] = useState<Grade | null>(null)
  const visibleDeckIdsKey = useMemo(
    () => JSON.stringify(visibleDeckIds ?? []),
    [visibleDeckIds],
  )

  const loadCards = useCallback(async () => {
    const nowIso = new Date().toISOString()
    const visibleDeckIdSet = new Set(visibleDeckIds ?? [])
    const hasVisibilityFilter = Array.isArray(visibleDeckIds)
    const list = await db.cards
      .filter((card) => (hasVisibilityFilter ? visibleDeckIdSet.has(card.deckId) : true))
      .filter((card) => (deckId ? card.deckId === deckId : true))
      .filter((card) => card.dueAt <= nowIso)
      .toArray()
    setCards(list)
    setCurrentIndex(0)
    setReveal(false)
  }, [deckId, visibleDeckIds])

  useEffect(() => {
    loadCards()
  }, [deckId, loadCards, visibleDeckIdsKey])

  const current = cards[currentIndex]

  const fsrsCard: CardInput | null = useMemo(() => {
    if (!current) return null
    return {
      due: new Date(current.dueAt),
      stability: current.stability,
      difficulty: current.difficulty,
      elapsed_days: current.elapsedDays,
      scheduled_days: current.scheduledDays,
      learning_steps: current.learningSteps,
      reps: current.reps,
      lapses: current.lapses,
      state: current.state,
      last_review: current.lastReviewedAt ? new Date(current.lastReviewedAt) : undefined,
    }
  }, [current])

  const nextIntervals = useMemo(() => {
    if (!fsrsCard) return new Map<Grade, string>()
    const map = new Map<Grade, string>()
    ratingLabels.forEach((item) => {
      const preview = reviewCard(fsrsCard, item.value)
      map.set(
        item.value,
        preview.next.due.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
      )
    })
    return map
  }, [fsrsCard])

  const handleRating = useCallback(async (rating: Grade) => {
    if (!current || current.id == null) return
    const cardId = current.id
    const deckId = current.deckId
    if (!fsrsCard) return
    const result = reviewCard(fsrsCard, rating)
    const nowIso = new Date().toISOString()
    await db.transaction('rw', db.cards, db.reviewLogs, async () => {
      await db.cards.update(cardId, {
        dueAt: result.next.due.toISOString(),
        stability: result.next.stability,
        difficulty: result.next.difficulty,
        elapsedDays: result.next.elapsed_days,
        scheduledDays: result.next.scheduled_days,
        learningSteps: result.next.learning_steps,
        reps: result.next.reps,
        lapses: result.next.lapses,
        state: result.next.state,
        lastReviewedAt: result.next.last_review ? result.next.last_review.toISOString() : null,
        updatedAt: nowIso,
      })
      await db.reviewLogs.add({
        cardId,
        deckId,
        rating,
        reviewedAt: nowIso,
        scheduledAt: result.next.due.toISOString(),
        elapsedDays: result.log.log.elapsed_days,
        scheduledDays: result.log.log.scheduled_days,
        stability: result.log.log.stability,
        difficulty: result.log.log.difficulty,
      })
    })
    setSessionReviewed((value) => value + 1)
    setLastRating(rating)
    await loadCards()
  }, [current, fsrsCard, loadCards])

  const postponeCard = useCallback(async () => {
    if (!current || current.id == null) return
    const nextMorning = new Date()
    nextMorning.setDate(nextMorning.getDate() + 1)
    nextMorning.setHours(8, 0, 0, 0)
    await db.cards.update(current.id, {
      dueAt: nextMorning.toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await loadCards()
  }, [current, loadCards])

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (event.code === 'Space') {
        event.preventDefault()
        if (current && !reveal) setReveal(true)
      }
      if (!reveal) return

      if (event.key === '1') void handleRating(Rating.Again)
      if (event.key === '2') void handleRating(Rating.Hard)
      if (event.key === '3') void handleRating(Rating.Good)
      if (event.key === '4') void handleRating(Rating.Easy)
      if (event.key.toLowerCase() === 's') void postponeCard()
    }

    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [current, handleRating, postponeCard, reveal])

  return (
    <section className="flex min-h-[calc(100vh-11rem)] flex-col">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-xs tracking-wide text-stone-500">今日待复习</div>
          <div className="text-4xl font-semibold text-stone-800">{cards.length}</div>
        </div>
        <div className="text-right text-xs text-stone-500">
          <div>本次已完成 {sessionReviewed}</div>
          <div>{lastRating == null ? '准备开始' : `上一题：${Rating[lastRating]}`}</div>
        </div>
      </header>

      {current ? (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col rounded-3xl border border-stone-200 bg-white p-7 shadow-[0_22px_42px_-34px_rgba(28,25,23,0.45)]">
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Front</div>
            <div className="mt-4 flex flex-1 items-center justify-center py-8">
              <p className="max-w-3xl text-center text-2xl leading-relaxed text-stone-800">{current.front}</p>
            </div>
            {reveal ? (
              <>
                <div className="my-4 h-px bg-stone-200" />
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Back</div>
                <p className="mt-3 pb-2 text-lg leading-relaxed text-stone-700">{current.back}</p>
              </>
            ) : (
              <button
                onClick={() => setReveal(true)}
                className="mt-2 h-12 rounded-xl border border-rose-200 bg-rose-100/80 px-4 text-sm font-medium text-stone-700"
              >
                显示答案
              </button>
            )}
          </div>

          {reveal && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {ratingLabels.map((item) => (
                <button
                  key={item.value}
                  onClick={() => handleRating(item.value)}
                  className={`h-14 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium ${item.tone}`}
                >
                  <div>{item.label}</div>
                  <div className="text-[10px] text-stone-500">{nextIntervals.get(item.value) ?? ''}</div>
                </button>
              ))}
              <button
                onClick={postponeCard}
                className="col-span-2 h-11 rounded-xl border border-stone-300 bg-stone-100 text-xs text-stone-600"
              >
                稍后再看（S）
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-stone-300 bg-white/70 p-10 text-center text-sm text-stone-500">
          今天没有待复习卡片，去牌组页导入或新建后即可开始。
        </div>
      )}
    </section>
  )
}
