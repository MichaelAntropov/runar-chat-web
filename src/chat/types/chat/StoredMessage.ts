export interface StoredMessage {
  id: string
  chatId: string
  senderId: string
  recipientId: string
  createdAt: number
  content: string
}
