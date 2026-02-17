import { useEffect, useRef, useState } from 'react'
import { db, type Deck } from './data/db'
import CardManager from './components/CardManager'
import StudyView from './components/StudyView'
import StatsPanel from './components/StatsPanel'
import { importApkg } from './anki/importer'

const nowIso = () => new Date().toISOString()

function App() {
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

  return (
    <main className="min-h-screen bg-[#f6f3ef] text-[#1f2a24]">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-6 py-10">
        <header className="space-y-3">
          <div className="w-fit rounded-full border border-[#e1d8cf] bg-white/80 px-4 py-1 text-xs tracking-[0.35em] text-[#8a7f76]">
            OPEN TO STUDY
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">牌组</h1>
          <p className="text-sm leading-6 text-[#6f665e]">
            管理你的学习空间。创建、重命名或移除牌组。
          </p>
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept=".apkg"
              onChange={handleImport}
              className="block w-full text-xs text-[#8a7f76] file:mr-4 file:rounded-xl file:border file:border-[#e5dad0] file:bg-white/80 file:px-4 file:py-2 file:text-xs file:text-[#6f665e]"
            />
            {importStatus && (
              <div className="text-xs text-[#8a7f76]">{importStatus}</div>
            )}
          </div>
        </header>

        <div className="rounded-2xl border border-[#e5dad0] bg-white/80 p-4 shadow-[0_20px_40px_-30px_rgba(31,42,36,0.45)]">
          <label className="text-xs text-[#8a7f76]">新建牌组</label>
          <div className="mt-2 flex gap-2">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="例如：TOEIC 高频"
              className="h-11 flex-1 rounded-xl border border-[#e5dad0] bg-white px-3 text-sm outline-none focus:border-[#cbbfb3]"
            />
            <button
              onClick={createDeck}
              className="h-11 rounded-xl border border-[#d9cec3] bg-[#f6f3ef] px-4 text-sm font-medium"
            >
              添加
            </button>
          </div>
        </div>

        <StudyView />

        <StatsPanel />

        <div className="space-y-3">
          {decks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#e1d8cf] bg-white/50 p-6 text-center text-sm text-[#8a7f76]">
              暂无牌组，先创建一个。
            </div>
          ) : (
            decks.map((deck) => (
              <div
                key={deck.id}
                className="rounded-2xl border border-[#e8ded4] bg-white/70 p-4"
              >
                {editingId === deck.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="h-10 flex-1 rounded-xl border border-[#e5dad0] bg-white px-3 text-sm"
                    />
                    <button
                      onClick={saveEdit}
                      className="h-10 rounded-xl border border-[#d9cec3] bg-[#f6f3ef] px-3 text-xs font-medium"
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-base font-medium">{deck.name}</p>
                      <p className="text-xs text-[#8a7f76]">Hash: {deck.hash}</p>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button
                        onClick={() => beginEdit(deck)}
                        className="rounded-lg border border-[#e5dad0] px-3 py-1"
                      >
                        重命名
                      </button>
                      <button
                        onClick={() => deleteDeck(deck.id)}
                        className="rounded-lg border border-[#eaded6] px-3 py-1 text-[#9b6b5a]"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <CardManager />
      </section>
    </main>
  )
}

export default App
