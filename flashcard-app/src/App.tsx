import { useEffect, useRef, useState } from 'react'
import { db, type Deck } from './data/db'
import CardManager from './components/CardManager'
import StudyView from './components/StudyView'
import StatsPanel from './components/StatsPanel'
import { importApkg } from './anki/importer'

const nowIso = () => new Date().toISOString()

function App() {
  const [activeTab, setActiveTab] = useState<'study' | 'library' | 'cards'>('study')
  const [decks, setDecks] = useState<Deck[]>([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const loadDecks = async () => {
    const items = await db.decks.orderBy('updatedAt').reverse().toArray()
    setDecks(items)
  }

  useEffect(() => {
    loadDecks()
  }, [])

  const createDeck = async () => {
    const name = newName.trim()
    if (!name) return
    const timestamp = nowIso()
    await db.decks.add({
      name,
      hash: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    setNewName('')
    await loadDecks()
  }

  const beginEdit = (deck: Deck) => {
    if (!deck.id) return
    setEditingId(deck.id)
    setEditingName(deck.name)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const name = editingName.trim()
    if (!name) return
    await db.decks.update(editingId, { name, updatedAt: nowIso() })
    setEditingId(null)
    setEditingName('')
    await loadDecks()
  }

  const deleteDeck = async (id?: number) => {
    if (!id) return
    await db.decks.delete(id)
    await loadDecks()
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImportStatus('导入中...')
    try {
      const result = await importApkg(file)
      setImportStatus(`已导入 ${result.decksImported} 个牌组`)
      await loadDecks()
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入失败'
      setImportStatus(message)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const formatToday = () =>
    new Date().toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    })

  const renderLibrary = () => (
    <>
      <section className="rounded-3xl border border-stone-200/70 bg-white/80 p-5 shadow-sm backdrop-blur">
        <h2 className="text-sm font-semibold tracking-wide text-stone-700">牌组管理</h2>
        <p className="mt-1 text-xs text-stone-500">导入、创建和维护你的学习牌组。</p>

        <div className="mt-4 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept=".apkg"
            onChange={handleImport}
            className="block w-full text-xs text-stone-500 file:mr-3 file:rounded-lg file:border file:border-stone-300 file:bg-stone-100 file:px-3 file:py-1.5 file:text-xs"
          />
          {importStatus && <div className="text-xs text-stone-500">{importStatus}</div>}
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

      <StatsPanel />

      <section className="space-y-3">
        {decks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-6 text-center text-sm text-stone-500">
            暂无牌组，先创建一个。
          </div>
        ) : (
          decks.map((deck) => (
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
                    <p className="text-sm font-medium text-stone-800">{deck.name}</p>
                    <p className="text-[11px] text-stone-500">{deck.hash}</p>
                  </div>
                  <div className="flex gap-2 text-xs">
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
    <main className="min-h-screen bg-gradient-to-b from-stone-100 via-rose-50/40 to-stone-100 text-stone-900">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-24 pt-7">
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

        <div className="flex flex-1 flex-col gap-4">
          {activeTab === 'study' ? <StudyView /> : null}
          {activeTab === 'library' ? renderLibrary() : null}
          {activeTab === 'cards' ? <CardManager /> : null}
        </div>

        <nav className="fixed bottom-4 left-1/2 z-20 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-stone-200 bg-white/85 p-2 shadow-lg backdrop-blur">
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
      </section>
    </main>
  )
}

export default App
