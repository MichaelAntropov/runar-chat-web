import type { ChatState } from '@/chat/types/chat/ChatState'
import { CHAT_STATES_STORE } from '../RunarDB'
import { useDbStore } from '../dbStore'

export class ChatStateRepository {
  private get db() {
    return useDbStore().db
  }

  async saveChatState(chatState: ChatState): Promise<string> {
    return this.db[CHAT_STATES_STORE].add(chatState)
  }

  async updateChatState(chatState: ChatState): Promise<string> {
    return this.db[CHAT_STATES_STORE].put(chatState)
  }

  async getFirstChatStateByDeviceId(deviceId: string): Promise<ChatState | undefined> {
    return this.db[CHAT_STATES_STORE].where('deviceId').equals(deviceId).first()
  }

  async getAllChatStatesByUserId(userId: string): Promise<ChatState[]> {
    return this.db[CHAT_STATES_STORE].where('userId').equals(userId).toArray()
  }

  async deleteByUserAndDeviceIds(deviceIdsByUser: Record<string, string[]>): Promise<number> {
    let deletedCount = 0

    await this.db.transaction('rw', this.db[CHAT_STATES_STORE], async () => {
      for (const [userId, deviceIds] of Object.entries(deviceIdsByUser)) {
        if (deviceIds.length === 0) continue

        const deviceIdSet = new Set(deviceIds)
        const chatStates = await this.db[CHAT_STATES_STORE].where('userId').equals(userId).toArray()
        const idsToDelete = chatStates
          .filter((chatState) => deviceIdSet.has(chatState.deviceId))
          .map((chatState) => chatState.deviceId)

        if (idsToDelete.length === 0) continue

        await this.db[CHAT_STATES_STORE].bulkDelete(idsToDelete)
        deletedCount += idsToDelete.length
      }
    })

    return deletedCount
  }
}

export const chatStateRepository = new ChatStateRepository()
