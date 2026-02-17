import { useEffect, useState } from 'react'
import { db } from '../data/db'

type Stats = {
  deckCount: number
  cardCount: number
  dueToday: number
  reviewedToday: number
}

export default function StatsPanel() {
  const [stats, setStats] = useState<Stats>({
    deckCount: 0,
    cardCount: 0,
    dueToday: 0,
    reviewedToday: 0,
  })

  useEffect(() => {
    const load = async () => {
      const [deckCount, cardCount] = await Promise.all([
        db.decks.count(),
        db.cards.count(),
      ])
      const nowIso = new Date().toISOString()
      const dueToday = await db.cards.where('dueAt').belowOrEqual(nowIso).count()
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      const reviewedToday = await db.reviewLogs
        .where('reviewedAt')
        .between(start.toISOString(), end.toISOString(), true, true)
        .count()
      setStats({ deckCount, cardCount, dueToday, reviewedToday })
    }
    load()
  }, [])

  return (
    <section className="rounded-3xl border border-stone-200 bg-white/70 p-5 shadow-sm">
      <header className="space-y-2">
        <div className="text-xs text-stone-500">统计</div>
        <div className="text-lg font-semibold text-stone-800">学习概览</div>
      </header>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-stone-200 bg-white/85 p-4">
          <div className="text-xs text-stone-500">牌组</div>
          <div className="mt-1 text-xl font-semibold text-stone-800">{stats.deckCount}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white/85 p-4">
          <div className="text-xs text-stone-500">卡片</div>
          <div className="mt-1 text-xl font-semibold text-stone-800">{stats.cardCount}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white/85 p-4">
          <div className="text-xs text-stone-500">待复习</div>
          <div className="mt-1 text-xl font-semibold text-stone-800">{stats.dueToday}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white/85 p-4">
          <div className="text-xs text-stone-500">今日已复习</div>
          <div className="mt-1 text-xl font-semibold text-stone-800">{stats.reviewedToday}</div>
        </div>
      </div>
    </section>
  )
}
