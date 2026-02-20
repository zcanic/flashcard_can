import { db } from '../data/db'
import { createCard } from '../fsrs/engine'
import type { ImportWorkerRequest, ImportWorkerResponse, ParsedImportPayload } from './workerTypes'

const nowIso = () => new Date().toISOString()

function parseWithWorker(file: File): Promise<ParsedImportPayload> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (event: MessageEvent<ImportWorkerResponse>) => {
      const message = event.data
      worker.terminate()
      if (message.type === 'success') {
        resolve(message.payload)
        return
      }
      reject(new Error(message.message))
    }

    worker.onerror = () => {
      worker.terminate()
      reject(new Error('Import worker crashed'))
    }

    void file
      .arrayBuffer()
      .then((buffer) => {
        const request: ImportWorkerRequest = {
          type: 'parse-apkg',
          fileName: file.name,
          buffer,
        }
        worker.postMessage(request, [buffer])
      })
      .catch((error) => {
        worker.terminate()
        reject(error instanceof Error ? error : new Error('Unable to start import worker'))
      })
  })
}

export async function importApkg(file: File) {
  const parsed = await parseWithWorker(file)

  const deckIdMap = new Map<number, number>()
  const timestamp = nowIso()

  await db.transaction('rw', db.decks, db.cards, async () => {
    for (const parsedDeck of parsed.decks) {
      const localDeckId = await db.decks.add({
        name: parsedDeck.name,
        hash: crypto.randomUUID(),
        isHidden: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      deckIdMap.set(parsedDeck.ankiDeckId, localDeckId)
    }

    for (const parsedCard of parsed.cards) {
      const deckId = deckIdMap.get(parsedCard.ankiDeckId)
      if (!deckId) continue

      const base = createCard()
      await db.cards.add({
        deckId,
        front: parsedCard.front,
        back: parsedCard.back,
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
  })

  return {
    mediaMap: parsed.mediaMap,
    decksImported: deckIdMap.size,
  }
}
