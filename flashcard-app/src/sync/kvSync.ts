export type SyncPayload = {
  deckHash: string
  updatedAt: string
  data: unknown
}

export type SyncClient = {
  push: (payload: SyncPayload) => Promise<void>
  pull: (deckHash: string) => Promise<SyncPayload | null>
}

export class KvSync implements SyncClient {
  constructor(private endpoint: string) {}

  async push(payload: SyncPayload) {
    await fetch(`${this.endpoint}/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  }

  async pull(deckHash: string) {
    const response = await fetch(`${this.endpoint}/pull?deck=${deckHash}`)
    if (!response.ok) return null
    return (await response.json()) as SyncPayload
  }
}
