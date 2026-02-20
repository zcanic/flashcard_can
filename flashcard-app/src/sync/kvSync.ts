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
  private endpoint: string

  constructor(endpoint: string) {
    this.endpoint = endpoint
  }

  async push(payload: SyncPayload) {
    const response = await fetch(`${this.endpoint}/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error(`Sync push failed: ${response.status}`)
    }
  }

  async pull(deckHash: string) {
    const response = await fetch(`${this.endpoint}/pull?deck=${encodeURIComponent(deckHash)}`)
    if (!response.ok) return null
    return (await response.json()) as SyncPayload
  }
}
