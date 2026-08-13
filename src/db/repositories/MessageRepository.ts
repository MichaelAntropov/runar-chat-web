import { Dexie } from 'dexie'

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

  async markUnreadAsRead(chatId: string, senderId: string, readAt: number): Promise<string[]> {
    const unreadMessages = await this.db[MESSAGES_STORE].where('chatId')
      .equals(chatId)
      .filter((message) => message.senderId === senderId && message.readAt === null)
      .toArray()

    if (unreadMessages.length === 0) return []

    await this.db[MESSAGES_STORE].bulkPut(unreadMessages.map((message) => ({ ...message, readAt })))

    return unreadMessages.map((message) => message.id)
  }
}

export const messageRepository = new MessageRepository()
