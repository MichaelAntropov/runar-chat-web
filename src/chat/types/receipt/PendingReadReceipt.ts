export interface PendingReadReceipt {
  messageId: string
  chatId: string
  readAt: number
  expiresAt: number
}
