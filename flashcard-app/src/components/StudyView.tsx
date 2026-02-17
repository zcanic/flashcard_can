import { useEffect, useState } from 'react'
import { db, type Card } from '../data/db'
import { reviewCard } from '../fsrs/engine'
import { Rating } from 'ts-fsrs'

type StudyViewProps = {
  deckId?: number
  visibleDeckIds?: number[]
}

const ratingLabels: Array<{ value: Rating; label: string; tone: string }> = [
  { value: Rating.Again, label: 'Again', tone: 'text-rose-700' },
  { value: Rating.Hard, label: 'Hard', tone: 'text-stone-600' },
  { value: Rating.Good, label: 'Good', tone: 'text-stone-800' },
  { value: Rating.Easy, label: 'Easy', tone: 'text-teal-700' },
]

export default function StudyView({ deckId, visibleDeckIds }: StudyViewProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reveal, setReveal] = useState(false)

  const loadCards = async () => {
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
  }

  useEffect(() => {
    loadCards()
  }, [deckId, visibleDeckIds.join(',')])

  const current = cards[currentIndex]

  const handleRating = async (rating: Rating) => {
    if (!current || !current.id) return
    const fsrsCard = {
      due: new Date(current.dueAt),
      stability: current.stability,
      difficulty: current.difficulty,
      elapsed_days: current.elapsedDays,
      scheduled_days: current.scheduledDays,
      learning_steps: current.learningSteps,
      reps: current.reps,
      lapses: current.lapses,
      state: current.state,
      last_review: current.lastReviewedAt ? new Date(current.lastReviewedAt) : null,
    }
    const result = reviewCard(fsrsCard, rating)
    await db.cards.update(current.id, {
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
      updatedAt: new Date().toISOString(),
    })
    await loadCards()
  }

  return (
    <section className="flex min-h-[calc(100vh-11rem)] flex-col">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-xs tracking-wide text-stone-500">今日待复习</div>
          <div className="text-4xl font-semibold text-stone-800">{cards.length}</div>
        </div>
        <div className="text-xs text-stone-500">卡片模式</div>
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
                  className={`h-12 rounded-xl border border-stone-200 bg-white text-sm font-medium ${item.tone}`}
                >
                  {item.label}
                </button>
              ))}
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
