export interface OfflineMessagesResponses {
  messages: Array<OfflineMessageResponse>
}

export interface OfflineMessageResponse {
  messageId: string
  createdAt: string

  senderId: string
  senderDeviceId: string

  preKeyIdUsed: string | null
  oneTimePreKeyIdUsed: string | null

  senderEphemeralKey: string | null
  cipherPayload: string
  encryptedHeader: string | null
}
