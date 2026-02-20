export type ParsedDeck = {
  ankiDeckId: number
  name: string
}

export type ParsedCard = {
  ankiDeckId: number
  front: string
  back: string
}

export type ParsedImportPayload = {
  mediaMap: Record<string, string>
  decks: ParsedDeck[]
  cards: ParsedCard[]
}

export type ImportWorkerRequest = {
  type: 'parse-apkg'
  fileName: string
  buffer: ArrayBuffer
}

export type ImportWorkerSuccess = {
  type: 'success'
  payload: ParsedImportPayload
}

export type ImportWorkerFailure = {
  type: 'error'
  message: string
}

export type ImportWorkerResponse = ImportWorkerSuccess | ImportWorkerFailure
