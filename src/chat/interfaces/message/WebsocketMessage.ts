export interface WebsocketMessage {
  messageId: string
  createdAt: string

  senderId: string
  senderDeviceId: string

  preKeyIdUsed: string | null
  oneTimePreKeyIdUsed: string | null

  senderEphemeralKey: string | null
  encryptedHeader: string | null

  cipherPayload: string
}
