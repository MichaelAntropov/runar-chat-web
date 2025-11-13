import type { ChatState } from '@/chat/interfaces/chat/ChatState'
import { db, CHAT_STATES_STORE } from '../veilDB'

export class ChatStateRepository {
  async saveChatState(chatState: ChatState): Promise<string> {
    return db[CHAT_STATES_STORE].add(chatState)
  }

  async updateChatState(chatState: ChatState): Promise<string> {
    return db[CHAT_STATES_STORE].put(chatState)
  }

  async getFirstChatStateByDeviceId(deviceId: string): Promise<ChatState | undefined> {
    return db[CHAT_STATES_STORE].where('deviceId').equals(deviceId).first()
  }

  async getAllChatStatesByUserId(userId: string): Promise<ChatState[]> {
    return db[CHAT_STATES_STORE].where('userId').equals(userId).toArray()
  }
}

export const chatStateRepository = new ChatStateRepository()
