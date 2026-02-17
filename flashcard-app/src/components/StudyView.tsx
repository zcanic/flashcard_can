import { useMemo, useState } from 'react'
import { db, type Card } from '../data/db'
import { reviewCard } from '../fsrs/engine'
import { Rating } from 'ts-fsrs'

type StudyViewProps = {
  deckId?: number
}

const ratingLabels: Array<{ value: Rating; label: string; tone: string }> = [
  { value: Rating.Again, label: 'Again', tone: 'text-[#9b6b5a]' },
  { value: Rating.Hard, label: 'Hard', tone: 'text-[#7c6b5d]' },
  { value: Rating.Good, label: 'Good', tone: 'text-[#4a5a52]' },
  { value: Rating.Easy, label: 'Easy', tone: 'text-[#3f6b62]' },
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

  useMemo(() => {
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
    <section className="rounded-3xl border border-[#e8ded4] bg-white/70 p-6 shadow-[0_20px_50px_-35px_rgba(31,42,36,0.45)]">
      <header className="space-y-2">
        <div className="text-xs text-[#8a7f76]">今日待复习</div>
        <div className="text-2xl font-semibold">{cards.length} 张</div>
      </header>

      {current ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-[#e5dad0] bg-white/80 p-5">
            <p className="text-base font-medium">{current.front}</p>
            {reveal ? (
              <p className="mt-4 text-sm text-[#6f665e]">{current.back}</p>
            ) : (
              <button
                onClick={() => setReveal(true)}
                className="mt-4 rounded-xl border border-[#e5dad0] px-4 py-2 text-xs"
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
                  className={`h-11 rounded-xl border border-[#e5dad0] bg-white text-sm font-medium ${item.tone}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-[#e1d8cf] bg-white/50 p-6 text-center text-sm text-[#8a7f76]">
          今天没有待复习卡片。
        </div>
      )}
    </section>
  )
}
