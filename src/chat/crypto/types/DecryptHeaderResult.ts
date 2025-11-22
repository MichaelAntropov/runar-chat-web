export interface DecryptHeaderResult {
  decryptedHeader: Uint8Array<ArrayBuffer>
  updateChatState: boolean
}
