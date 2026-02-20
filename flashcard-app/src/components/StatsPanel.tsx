import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../data/db'

type Stats = {
  deckCount: number
  cardCount: number
  dueToday: number
  reviewedToday: number
}

type StatsPanelProps = {
  visibleDeckIds?: number[]
}

export default function StatsPanel({ visibleDeckIds }: StatsPanelProps) {
  const [stats, setStats] = useState<Stats>({
    deckCount: 0,
    cardCount: 0,
    dueToday: 0,
    reviewedToday: 0,
  })

  const visibleDeckIdsKey = useMemo(
    () => JSON.stringify(visibleDeckIds ?? []),
    [visibleDeckIds],
  )

  const [weekReviews, setWeekReviews] = useState<Array<{ day: string; count: number }>>([])
  const [todayAccuracy, setTodayAccuracy] = useState<number>(0)

  const loadStats = useCallback(async () => {
    const visibleDeckIdSet = new Set(visibleDeckIds ?? [])
    const hasVisibilityFilter = Array.isArray(visibleDeckIds)

    const allDecks = await db.decks.toArray()
    const deckCount = hasVisibilityFilter
      ? allDecks.filter((deck) => deck.id && visibleDeckIdSet.has(deck.id)).length
      : allDecks.filter((deck) => !deck.isHidden).length

    const allCards = await db.cards.toArray()
    const scopedCards = allCards.filter((card) =>
      hasVisibilityFilter ? visibleDeckIdSet.has(card.deckId) : true,
    )
    const cardCount = scopedCards.length
    const nowIso = new Date().toISOString()
    const dueToday = scopedCards.filter((card) => card.dueAt <= nowIso).length

    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    const todayLogs = (
      await db.reviewLogs
        .where('reviewedAt')
        .between(start.toISOString(), end.toISOString(), true, true)
        .toArray()
    ).filter((log) => (hasVisibilityFilter ? visibleDeckIdSet.has(log.deckId) : true))

    const reviewedToday = todayLogs.length
    const successCount = todayLogs.filter((log) => log.rating >= 3).length
    const accuracy = reviewedToday > 0 ? Math.round((successCount / reviewedToday) * 100) : 0

    const week: Array<{ day: string; count: number }> = []
    for (let i = 6; i >= 0; i -= 1) {
      const from = new Date()
      from.setDate(from.getDate() - i)
      from.setHours(0, 0, 0, 0)
      const to = new Date(from)
      to.setHours(23, 59, 59, 999)
      const count = (
        await db.reviewLogs
          .where('reviewedAt')
          .between(from.toISOString(), to.toISOString(), true, true)
          .toArray()
      ).filter((log) => (hasVisibilityFilter ? visibleDeckIdSet.has(log.deckId) : true)).length
      week.push({
        day: from.toLocaleDateString('zh-CN', { weekday: 'short' }),
        count,
      })
    }

    setStats({ deckCount, cardCount, dueToday, reviewedToday })
    setWeekReviews(week)
    setTodayAccuracy(accuracy)
  }, [visibleDeckIds])

  useEffect(() => {
    loadStats()
  }, [loadStats, visibleDeckIdsKey])

  const maxWeekCount = weekReviews.reduce((max, item) => Math.max(max, item.count), 1)

  return (
    <section className="rounded-3xl border border-stone-200 bg-white/70 p-5 shadow-sm space-y-4">
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

      <div className="rounded-2xl border border-stone-200 bg-white/90 p-4">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span>近 7 天复习量</span>
          <span>今日正确率 {todayAccuracy}%</span>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-2">
          {weekReviews.map((item) => (
            <div key={item.day} className="flex flex-col items-center gap-1">
              <div className="flex h-16 w-full items-end">
                <div
                  className="w-full rounded-md bg-rose-200/80"
                  style={{ height: `${Math.max(8, (item.count / maxWeekCount) * 64)}px` }}
                  title={`${item.day}: ${item.count}`}
                />
              </div>
              <div className="text-[10px] text-stone-500">{item.day}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
