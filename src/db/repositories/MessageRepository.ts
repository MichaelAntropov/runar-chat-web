import { Dexie } from 'dexie'

import type { DeliveryReceipt } from '@/chat/types/receipt/DeliveryReceipt'
import type { ReadReceipt } from '@/chat/types/receipt/ReadReceipt'
import { MESSAGES_STORE } from '@/db/RunarDB'

import type { StoredMessage } from '../../chat/types/chat/StoredMessage'
import { useDbStore } from '../dbStore'

export class MessageRepository {
  private get db() {
    return useDbStore().db
  }

  async saveMessage(message: StoredMessage): Promise<string> {
    return this.db[MESSAGES_STORE].add(message, message.id)
  }

  async getLatestByChatId(chatId: string, size: number): Promise<StoredMessage[]> {
    // https://github.com/dexie/Dexie.js/issues/167
    return this.db[MESSAGES_STORE].where('[chatId+createdAt]')
      .between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
      .reverse()
      .offset(0)
      .limit(size)
      .toArray()
  }

  async getByChatIdOrderByCratedAtAsc(
    chatId: string,
    offset: number,
    size: number,
  ): Promise<StoredMessage[]> {
    return this.db[MESSAGES_STORE].where('[chatId+createdAt]')
      .between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
      .offset(offset)
      .limit(size)
      .toArray()
  }

  async countByChatId(chatId: string): Promise<number> {
    return this.db[MESSAGES_STORE].where('chatId').equals(chatId).count()
  }

  async countUnreadByChatId(chatId: string, senderId: string): Promise<number> {
    return this.db[MESSAGES_STORE].where('chatId')
      .equals(chatId)
      .filter((message) => message.senderId === senderId && message.readAt === null)
      .count()
  }

  async markMessagesAsRead(
    chatId: string,
    senderId: string,
    messageIds: string[],
    readAt: number,
  ): Promise<StoredMessage[]> {
    if (messageIds.length === 0) return []

    const unreadMessages = await this.db[MESSAGES_STORE].where('id')
      .anyOf(messageIds)
      .filter(
        (message) =>
          message.chatId === chatId && message.senderId === senderId && message.readAt === null,
      )
      .toArray()

    if (unreadMessages.length === 0) return []

    const updatedMessages = unreadMessages.map((message) => ({ ...message, readAt }))
    await this.db[MESSAGES_STORE].bulkPut(updatedMessages)
    return updatedMessages
  }

  async applyReadReceipts(
    chatId: string,
    senderId: string,
    recipientId: string,
    receipts: ReadReceipt[],
  ): Promise<StoredMessage[]> {
    if (receipts.length === 0) return []

    const receiptByMessageId = new Map<string, ReadReceipt>()
    for (const receipt of receipts) {
      const existing = receiptByMessageId.get(receipt.messageId)
      if (!existing || receipt.readAt < existing.readAt) {
        receiptByMessageId.set(receipt.messageId, receipt)
      }
    }
    const messages = await this.db[MESSAGES_STORE].where('id')
      .anyOf([...receiptByMessageId.keys()])
      .filter(
        (message) =>
          message.chatId === chatId &&
          message.senderId === senderId &&
          message.recipientId === recipientId,
      )
      .toArray()

    const updatedMessages = messages
      .map((message): StoredMessage | null => {
        const receipt = receiptByMessageId.get(message.id)
        if (!receipt) return null

        const nextReadAt =
          message.readAt === null ? receipt.readAt : Math.min(message.readAt, receipt.readAt)
        if (nextReadAt === message.readAt) return null
        return { ...message, readAt: nextReadAt }
      })
      .filter((message): message is StoredMessage => message !== null)

    if (updatedMessages.length > 0) {
      await this.db[MESSAGES_STORE].bulkPut(updatedMessages)
    }
    return updatedMessages
  }

  async applyDeliveryReceipts(
    senderId: string,
    receipts: DeliveryReceipt[],
  ): Promise<{
    updatedMessages: StoredMessage[]
    unresolvedReceipts: DeliveryReceipt[]
  }> {
    if (receipts.length === 0) {
      return { updatedMessages: [], unresolvedReceipts: [] }
    }

    const receiptByMessageId = new Map<string, DeliveryReceipt>()
    for (const receipt of receipts) {
      const existing = receiptByMessageId.get(receipt.messageId)
      if (!existing || receipt.deliveredAt < existing.deliveredAt) {
        receiptByMessageId.set(receipt.messageId, receipt)
      }
    }

    const messages = await this.db[MESSAGES_STORE].where('id')
      .anyOf([...receiptByMessageId.keys()])
      .toArray()
    const messageById = new Map(messages.map((message) => [message.id, message]))
    const unresolvedReceipts = [...receiptByMessageId.values()].filter(
      (receipt) => !messageById.has(receipt.messageId),
    )

    const updatedMessages = messages
      .map((message): StoredMessage | null => {
        if (message.senderId !== senderId || message.recipientId === senderId) return null

        const receipt = receiptByMessageId.get(message.id)
        if (!receipt) return null

        const currentDeliveredAt = message.deliveredAt ?? null
        const deliveredAt =
          currentDeliveredAt === null
            ? receipt.deliveredAt
            : Math.min(currentDeliveredAt, receipt.deliveredAt)
        if (deliveredAt === currentDeliveredAt) return null

        return { ...message, deliveredAt }
      })
      .filter((message): message is StoredMessage => message !== null)

    if (updatedMessages.length > 0) {
      await this.db[MESSAGES_STORE].bulkPut(updatedMessages)
    }

    return { updatedMessages, unresolvedReceipts }
  }
}

export const messageRepository = new MessageRepository()
