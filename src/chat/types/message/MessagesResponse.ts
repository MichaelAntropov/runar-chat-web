import type { DeliveryReceiptResponse } from '@/chat/types/receipt/DeliveryReceiptResponse'

export interface ReceiveMessagesResponse {
  messages: Array<OfflineMessageResponse>
  deliveryReceipts: DeliveryReceiptResponse[]
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
