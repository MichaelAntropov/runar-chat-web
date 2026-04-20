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
}

export const chatStateRepository = new ChatStateRepository()
