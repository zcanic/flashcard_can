import { useEffect, useState } from 'react'
import { db, type Card } from '../data/db'
import { reviewCard } from '../fsrs/engine'
import { Rating } from 'ts-fsrs'

type StudyViewProps = {
  deckId?: number
}

const ratingLabels: Array<{ value: Rating; label: string; tone: string }> = [
  { value: Rating.Again, label: 'Again', tone: 'text-rose-700' },
  { value: Rating.Hard, label: 'Hard', tone: 'text-stone-600' },
  { value: Rating.Good, label: 'Good', tone: 'text-stone-800' },
  { value: Rating.Easy, label: 'Easy', tone: 'text-teal-700' },
]

export default function StudyView({ deckId }: StudyViewProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reveal, setReveal] = useState(false)

  const loadCards = async () => {
    const nowIso = new Date().toISOString()
    const list = await db.cards
      .filter((card) => (deckId ? card.deckId === deckId : true))
      .filter((card) => card.dueAt <= nowIso)
      .toArray()
    setCards(list)
    setCurrentIndex(0)
    setReveal(false)
  }

  useEffect(() => {
    loadCards()
  }, [deckId])

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
    <section className="rounded-3xl border border-stone-200 bg-white/70 p-5 shadow-[0_20px_45px_-30px_rgba(28,25,23,0.25)] backdrop-blur">
      <header className="space-y-2">
        <div className="text-xs tracking-wide text-stone-500">今日待复习</div>
        <div className="text-3xl font-semibold text-stone-800">{cards.length}</div>
      </header>

      {current ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-3xl border border-rose-100/70 bg-gradient-to-b from-white to-rose-50/35 p-6">
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Front</div>
            <p className="mt-3 text-base leading-7 text-stone-800">{current.front}</p>
            {reveal ? (
              <>
                <div className="my-4 h-px bg-stone-200" />
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Back</div>
                <p className="mt-3 text-sm leading-7 text-stone-700">{current.back}</p>
              </>
            ) : (
              <button
                onClick={() => setReveal(true)}
                className="mt-5 h-10 rounded-xl border border-rose-200 bg-rose-100/70 px-4 text-xs font-medium text-stone-700"
              >
                显示答案
              </button>
            )}
          </div>

          {reveal && (
            <div className="grid grid-cols-2 gap-3">
              {ratingLabels.map((item) => (
                <button
                  key={item.value}
                  onClick={() => handleRating(item.value)}
                  className={`h-11 rounded-xl border border-stone-200 bg-white/90 text-sm font-medium ${item.tone}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-10 text-center text-sm text-stone-500">
          今天没有待复习卡片。
        </div>
      )}
    </section>
  )
}
