export interface ChatState {
  deviceId: string
  userId: string

  x25519publicIdentityKey: Uint8Array<ArrayBuffer> | null

  dhSendingKeyPair: CryptoKeyPair | null
  dhReceivingPublicKey: Uint8Array<ArrayBuffer> | null

  rootKey: Uint8Array<ArrayBuffer> | null

  chainKeySending: Uint8Array<ArrayBuffer> | null
  chainKeyReceiving: Uint8Array<ArrayBuffer> | null

  sendingMessageNumber: number
  receivingMessageNumber: number

  previousChainLength: number

  skippedMessageKeys: Map<string, Uint8Array<ArrayBuffer>>

  preKeyIdUsed: string | null
  ephemeralPublicBytes: Uint8Array<ArrayBuffer> | null
}
