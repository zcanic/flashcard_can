import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { GoeyToaster, goeyToast } from 'goey-toast'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import { db, type Deck } from './data/db'
import { createBackupSnapshot, restoreBackupSnapshot } from './backup/snapshot'
import { createCard } from './fsrs/engine'
import InstallBanner from './components/InstallBanner'

const StudyView = lazy(() => import('./components/StudyView'))
const CardManager = lazy(() => import('./components/CardManager'))
const StatsPanel = lazy(() => import('./components/StatsPanel'))

const nowIso = () => new Date().toISOString()

function App() {
  const [activeTab, setActiveTab] = useState<'study' | 'library' | 'cards'>('study')
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'visible' | 'hidden'>('all')
  const [decks, setDecks] = useState<Deck[]>([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [backupDialogOpen, setBackupDialogOpen] = useState(false)
  const [backupCandidate, setBackupCandidate] = useState<unknown | null>(null)
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine)
  const [isStandalone, setIsStandalone] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as { standalone?: boolean }).standalone),
  )
  const fileRef = useRef<HTMLInputElement | null>(null)
  const backupRef = useRef<HTMLInputElement | null>(null)

  const loadDecks = async () => {
    const items = await db.decks.orderBy('updatedAt').reverse().toArray()
    setDecks(items)
  }

  const visibleDeckIds = useMemo(
    () => decks.filter((deck) => deck.id && !deck.isHidden).map((deck) => deck.id as number),
    [decks],
  )

  const visibleDeckCount = useMemo(
    () => decks.filter((deck) => !deck.isHidden).length,
    [decks],
  )

  const hiddenDeckCount = decks.length - visibleDeckCount

  const filteredDecks = useMemo(() => {
    if (libraryFilter === 'visible') {
      return decks.filter((deck) => !deck.isHidden)
    }
    if (libraryFilter === 'hidden') {
      return decks.filter((deck) => deck.isHidden)
    }
    return decks
  }, [decks, libraryFilter])

  useEffect(() => {
    const bootstrap = async () => {
      const count = await db.decks.count()
      if (count === 0) {
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
      }
      await loadDecks()
    }
    bootstrap()
  }, [])

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((value) => !value)
      }
    }

    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [])

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    const media = window.matchMedia('(display-mode: standalone)')
    const onModeChange = () => setIsStandalone(media.matches || Boolean((window.navigator as { standalone?: boolean }).standalone))

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    media.addEventListener('change', onModeChange)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      media.removeEventListener('change', onModeChange)
    }
  }, [])

  const exportBackup = async () => {
    try {
      const snapshot = await createBackupSnapshot()
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `flashcard-backup-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      goeyToast.success('备份导出成功')
    } catch (error) {
      goeyToast.error('导出失败', {
        description: error instanceof Error ? error.message : '未知错误',
      })
    }
  }

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const payload = JSON.parse(text) as unknown
      setBackupCandidate(payload)
      setBackupDialogOpen(true)
    } catch (error) {
      goeyToast.error('导入备份失败', {
        description: error instanceof Error ? error.message : '文件格式错误',
      })
    }

    if (backupRef.current) backupRef.current.value = ''
  }

  const restoreBackup = async (mode: 'replace' | 'merge') => {
    if (!backupCandidate) return
    try {
      const result = await restoreBackupSnapshot(backupCandidate, mode)
      await loadDecks()
      goeyToast.success('备份导入成功', {
        description: `牌组 ${result.decks} / 卡片 ${result.cards} / 记录 ${result.reviewLogs}`,
      })
      setBackupDialogOpen(false)
      setBackupCandidate(null)
    } catch (error) {
      goeyToast.error('导入备份失败', {
        description: error instanceof Error ? error.message : '文件格式错误',
      })
    }
  }

  const createDeck = async () => {
    const name = newName.trim()
    if (!name) {
      goeyToast.warning('请输入牌组名称', { spring: true, bounce: 0.22 })
      return
    }
    const timestamp = nowIso()
    try {
      await db.decks.add({
        name,
        hash: crypto.randomUUID(),
        isHidden: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      setNewName('')
      await loadDecks()
      goeyToast.success('牌组已创建', {
        description: `已添加：${name}`,
        fillColor: '#f7e8ec',
        borderColor: '#e7cfd7',
        spring: true,
        bounce: 0.26,
      })
    } catch (error) {
      goeyToast.error('创建失败', {
        description: error instanceof Error ? error.message : '数据库写入失败',
      })
    }
  }

  const beginEdit = (deck: Deck) => {
    if (!deck.id) return
    setEditingId(deck.id)
    setEditingName(deck.name)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const name = editingName.trim()
    if (!name) {
      goeyToast.warning('名称不能为空')
      return
    }
    try {
      await db.decks.update(editingId, { name, updatedAt: nowIso() })
      setEditingId(null)
      setEditingName('')
      await loadDecks()
      goeyToast('牌组已重命名', {
        description: name,
        fillColor: '#f8f5f2',
        borderColor: '#e5ddd6',
        spring: false,
      })
    } catch (error) {
      goeyToast.error('重命名失败', {
        description: error instanceof Error ? error.message : '数据库写入失败',
      })
    }
  }

  const deleteDeck = async (id?: number) => {
    if (!id) return
    try {
      await db.transaction('rw', db.decks, db.cards, db.reviewLogs, async () => {
        await db.cards.where('deckId').equals(id).delete()
        await db.reviewLogs.where('deckId').equals(id).delete()
        await db.decks.delete(id)
      })
      await loadDecks()
      goeyToast.info('牌组已删除', {
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

  const toggleDeckVisibility = async (deck: Deck) => {
    if (!deck.id) return
    const nextHidden = !deck.isHidden
    try {
      await db.decks.update(deck.id, {
        isHidden: nextHidden,
        updatedAt: nowIso(),
      })
      await loadDecks()
      goeyToast(nextHidden ? '已隐藏该牌组卡片' : '已恢复该牌组卡片', {
        description: deck.name,
        fillColor: '#f8f5f2',
        borderColor: '#e5ddd6',
        spring: false,
      })
    } catch (error) {
      goeyToast.error('更新可见性失败', {
        description: error instanceof Error ? error.message : '数据库写入失败',
      })
    }
  }

  const setAllDeckVisibility = async (showAll: boolean) => {
    const timestamp = nowIso()
    try {
      await db.decks.toCollection().modify({
        isHidden: !showAll,
        updatedAt: timestamp,
      })
      await loadDecks()
      goeyToast.success(showAll ? '已显示全部牌组卡片' : '已隐藏全部牌组卡片')
    } catch (error) {
      goeyToast.error('批量更新失败', {
        description: error instanceof Error ? error.message : '数据库写入失败',
      })
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const lowerName = file.name.toLowerCase()
    const isSupported =
      lowerName.endsWith('.apkg') ||
      lowerName.endsWith('.apk.1g') ||
      lowerName.endsWith('.1g')
    if (!isSupported) {
      setImportStatus('暂不支持该文件类型，请使用 .apkg 或 .apk.1g')
      goeyToast.warning('文件格式不支持', {
        description: '请导入 .apkg 或 .apk.1g 文件',
      })
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setImportStatus('导入中...')
    try {
      const toastId = goeyToast('正在导入牌组文件', {
        description: file.name,
        fillColor: '#f8f5f2',
        borderColor: '#dfd7d0',
        spring: true,
        bounce: 0.2,
      })
      const { importApkg } = await import('./anki/importer')
      const result = await importApkg(file)
      setImportStatus(`已导入 ${result.decksImported} 个牌组`)
      await loadDecks()
      goeyToast.dismiss(toastId)
      goeyToast.success('导入完成', {
        description: `新增 ${result.decksImported} 个牌组`,
        fillColor: '#f7e8ec',
        borderColor: '#e7cfd7',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入失败'
      setImportStatus(message)
      goeyToast.error('导入失败', {
        description: message,
        fillColor: '#f9ece8',
        borderColor: '#e7c6bc',
      })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const formatToday = () =>
    new Date().toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    })

  const contentFallback = (
    <div className="rounded-2xl border border-stone-200 bg-white/70 p-4 text-xs text-stone-500">加载中...</div>
  )

  const backupPreview = useMemo(() => {
    if (!backupCandidate || typeof backupCandidate !== 'object') return null
    const input = backupCandidate as { decks?: unknown[]; cards?: unknown[]; reviewLogs?: unknown[] }
    return {
      decks: Array.isArray(input.decks) ? input.decks.length : 0,
      cards: Array.isArray(input.cards) ? input.cards.length : 0,
      reviewLogs: Array.isArray(input.reviewLogs) ? input.reviewLogs.length : 0,
    }
  }, [backupCandidate])

  const renderLibrary = () => (
    <>
      <section className="rounded-3xl border border-stone-200/70 bg-white/80 p-5 shadow-sm backdrop-blur">
        <h2 className="text-sm font-semibold tracking-wide text-stone-700">牌组管理</h2>
        <p className="mt-1 text-xs text-stone-500">导入、创建和维护你的学习牌组。</p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1 text-stone-600">
            显示中 {visibleDeckCount}
          </span>
          <span className="rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1 text-stone-600">
            已隐藏 {hiddenDeckCount}
          </span>
          <button
            onClick={() => setAllDeckVisibility(true)}
            className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-stone-600"
          >
            全部显示
          </button>
          <button
            onClick={() => setAllDeckVisibility(false)}
            className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-stone-600"
          >
            全部隐藏
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept=".apkg,.apk.1g,.1g"
            onChange={handleImport}
            className="block w-full text-xs text-stone-500 file:mr-3 file:rounded-lg file:border file:border-stone-300 file:bg-stone-100 file:px-3 file:py-1.5 file:text-xs"
          />
          {importStatus && <div className="text-xs text-stone-500">{importStatus}</div>}
          <div className="flex gap-2">
            <button
              onClick={exportBackup}
              className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-xs text-stone-600"
            >
              导出备份 JSON
            </button>
            <button
              onClick={() => backupRef.current?.click()}
              className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-xs text-stone-600"
            >
              导入备份 JSON
            </button>
            <input
              ref={backupRef}
              type="file"
              accept="application/json"
              onChange={importBackup}
              className="hidden"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="例如：N2 高频词"
            className="h-10 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-rose-300"
          />
          <button
            onClick={createDeck}
            className="h-10 rounded-xl border border-rose-200 bg-rose-100/70 px-4 text-sm font-medium text-stone-700"
          >
            新建
          </button>
        </div>
      </section>

      <Suspense fallback={contentFallback}>
        <StatsPanel visibleDeckIds={visibleDeckIds} />
      </Suspense>

      <section className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white/70 px-3 py-2 text-xs text-stone-600">
        <span>筛选牌组</span>
        <select
          value={libraryFilter}
          onChange={(event) => setLibraryFilter(event.target.value as 'all' | 'visible' | 'hidden')}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1"
        >
          <option value="all">全部</option>
          <option value="visible">仅显示中的牌组</option>
          <option value="hidden">仅已隐藏牌组</option>
        </select>
      </section>

      <section className="space-y-3">
        {filteredDecks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-6 text-center text-sm text-stone-500">
            暂无牌组，先创建一个。
          </div>
        ) : (
          filteredDecks.map((deck) => (
            <div key={deck.id} className="rounded-2xl border border-stone-200 bg-white/75 p-4 shadow-sm">
              {editingId === deck.id ? (
                <div className="flex gap-2">
                  <input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    className="h-10 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm"
                  />
                  <button
                    onClick={saveEdit}
                    className="h-10 rounded-xl border border-rose-200 bg-rose-100/70 px-3 text-xs font-medium"
                  >
                    保存
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-stone-800">
                      {deck.name}
                      {deck.isHidden ? (
                        <span className="ml-2 rounded-md border border-stone-300 bg-stone-100 px-1.5 py-0.5 text-[10px] font-normal text-stone-500">
                          已隐藏
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-stone-500">{deck.hash}</p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => toggleDeckVisibility(deck)}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1"
                    >
                      {deck.isHidden ? '显示卡片' : '隐藏卡片'}
                    </button>
                    <button
                      onClick={() => beginEdit(deck)}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1"
                    >
                      重命名
                    </button>
                    <button
                      onClick={() => deleteDeck(deck.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700"
                    >
                      删除
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </>
  )

  return (
    <main className="min-h-screen bg-[#f2efeb] text-stone-900">
      <section className="flex min-h-screen w-full flex-col px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] md:px-8">
        <header className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-stone-500">Focus Study</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-800">
              {activeTab === 'study' ? '今日学习' : activeTab === 'library' ? '学习库' : '卡片编辑'}
            </h1>
          </div>
          <div className="rounded-full border border-rose-200 bg-rose-100/70 px-3 py-1 text-xs text-stone-600">
            {formatToday()}
          </div>
        </header>

        <InstallBanner />

        <button
          onClick={() => setCommandOpen(true)}
          className="mb-2 h-9 rounded-xl border border-stone-300 bg-white/75 px-3 text-xs text-stone-600"
        >
          打开命令面板 ⌘K / Ctrl+K
        </button>

        {!isOnline ? (
          <section className="mb-2 rounded-2xl border border-amber-300 bg-amber-50/90 px-3 py-2 text-xs text-amber-800">
            当前离线：可继续学习与复习，联网后再导入和同步备份。
          </section>
        ) : null}

        <section className="mb-2 flex items-center justify-between rounded-2xl border border-stone-200 bg-white/70 px-3 py-2 text-[11px] text-stone-600">
          <span>{isStandalone ? '已作为桌面应用运行' : '建议添加到主屏幕获得完整体验'}</span>
          <span className="rounded-full border border-stone-300 bg-white px-2 py-0.5 text-[10px]">{isOnline ? '在线' : '离线'}</span>
        </section>

        <div className={`flex flex-1 flex-col gap-4 ${activeTab === 'study' ? '' : 'mx-auto w-full max-w-3xl'}`}>
            <div className="flex flex-1 flex-col gap-4">
               {activeTab === 'study' ? (
                  <>
                   <section className="rounded-3xl border border-stone-200/80 bg-white/80 p-5 shadow-sm backdrop-blur">
                     <div className="flex items-center justify-between">
                       <div>
                         <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Today Sprint</div>
                         <h2 className="mt-1 text-xl font-semibold text-stone-800">先完成今日到期卡片</h2>
                         <p className="mt-1 text-xs text-stone-500">保持节奏比一次刷很多更重要，建议每天 8-15 分钟。</p>
                       </div>
                       <button
                         onClick={() => setActiveTab('cards')}
                         className="h-10 rounded-xl border border-stone-300 bg-white px-3 text-xs text-stone-600"
                       >
                         新增卡片
                       </button>
                     </div>
                   </section>
                   <Suspense fallback={contentFallback}>
                     <StudyView visibleDeckIds={visibleDeckIds} />
                   </Suspense>
                  </>
                ) : null}
               {activeTab === 'library' ? renderLibrary() : null}
               {activeTab === 'cards' ? (
                 <Suspense fallback={contentFallback}>
                   <CardManager visibleDeckIds={visibleDeckIds} />
                 </Suspense>
               ) : null}
            </div>
        </div>

        <nav className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-20 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-stone-200 bg-white/88 p-2 shadow-lg backdrop-blur">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              onClick={() => setActiveTab('study')}
              className={`h-10 rounded-xl ${activeTab === 'study' ? 'bg-rose-100 text-stone-900' : 'text-stone-500'}`}
            >
              学习
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className={`h-10 rounded-xl ${activeTab === 'library' ? 'bg-rose-100 text-stone-900' : 'text-stone-500'}`}
            >
              牌组
            </button>
            <button
              onClick={() => setActiveTab('cards')}
              className={`h-10 rounded-xl ${activeTab === 'cards' ? 'bg-rose-100 text-stone-900' : 'text-stone-500'}`}
            >
              卡片
            </button>
          </div>
        </nav>

        <GoeyToaster
          position="top-center"
          spring
          bounce={0.24}
          offset="20px"
          theme="light"
        />

        <Dialog.Root open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-30 bg-stone-900/35" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-40 w-[min(90vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
              <Dialog.Title className="text-sm font-semibold text-stone-800">选择备份导入模式</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-stone-500">
                合并会保留当前数据，覆盖会清空现有数据后导入。
              </Dialog.Description>
              {backupPreview ? (
                <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
                  预览：牌组 {backupPreview.decks} / 卡片 {backupPreview.cards} / 记录 {backupPreview.reviewLogs}
                </div>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => void restoreBackup('merge')}
                  className="h-10 rounded-xl border border-stone-300 bg-white"
                >
                  合并导入
                </button>
                <button
                  onClick={() => void restoreBackup('replace')}
                  className="h-10 rounded-xl border border-rose-200 bg-rose-100 text-stone-700"
                >
                  覆盖导入
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <Command.Dialog
          open={commandOpen}
          onOpenChange={setCommandOpen}
          label="全局命令面板"
          className="fixed left-1/2 top-24 z-40 w-[min(92vw,520px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
        >
          <Command.Input
            placeholder="输入命令..."
            className="h-11 w-full border-b border-stone-200 px-3 text-sm outline-none"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2 text-sm">
            <Command.Empty className="p-3 text-xs text-stone-500">没有匹配命令</Command.Empty>
            <Command.Group heading="导航" className="text-xs text-stone-500">
              <Command.Item className="cursor-pointer rounded-lg px-2 py-2" onSelect={() => { setActiveTab('study'); setCommandOpen(false) }}>
                前往：学习
              </Command.Item>
              <Command.Item className="cursor-pointer rounded-lg px-2 py-2" onSelect={() => { setActiveTab('library'); setCommandOpen(false) }}>
                前往：牌组
              </Command.Item>
              <Command.Item className="cursor-pointer rounded-lg px-2 py-2" onSelect={() => { setActiveTab('cards'); setCommandOpen(false) }}>
                前往：卡片
              </Command.Item>
            </Command.Group>
            <Command.Group heading="操作" className="text-xs text-stone-500">
              <Command.Item className="cursor-pointer rounded-lg px-2 py-2" onSelect={() => { void exportBackup(); setCommandOpen(false) }}>
                导出备份
              </Command.Item>
              <Command.Item className="cursor-pointer rounded-lg px-2 py-2" onSelect={() => { fileRef.current?.click(); setCommandOpen(false) }}>
                导入 APKG
              </Command.Item>
              <Command.Item className="cursor-pointer rounded-lg px-2 py-2" onSelect={() => { backupRef.current?.click(); setCommandOpen(false) }}>
                导入 JSON 备份
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command.Dialog>
      </section>
    </main>
  )
}

export default App
