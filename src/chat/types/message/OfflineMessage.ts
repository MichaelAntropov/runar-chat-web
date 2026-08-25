export interface OfflineMessage {
  messageId: string
  createdAt: string

  senderId: string
  senderDeviceId: string

  signedPreKeyIdUsed: string | null
  oneTimePreKeyIdUsed: string | null

  senderEphemeralKey: Uint8Array<ArrayBuffer> | null
  encryptedHeader: Uint8Array<ArrayBuffer> | null

  cipherPayload: Uint8Array<ArrayBuffer>
}
