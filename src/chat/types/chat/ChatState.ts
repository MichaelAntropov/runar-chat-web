import type { SkippedMessageKey } from '@/chat/crypto/types/SkippedMessage'

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

  skippedMessageKeys: Array<SkippedMessageKey>

  headerKeySending: Uint8Array<ArrayBuffer> | null
  headerKeyNextSending: Uint8Array<ArrayBuffer> | null

  headerKeyReceiving: Uint8Array<ArrayBuffer> | null
  headerKeyNextReceiving: Uint8Array<ArrayBuffer> | null

  preKeyIdUsed: string | null
  ephemeralPublicBytes: Uint8Array<ArrayBuffer> | null
}
