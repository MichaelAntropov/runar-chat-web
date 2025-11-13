import type { OneTimePreKeyState } from '../device/interfaces/OneTimePreKeyState'
import type { StoredMessage } from '../chat/interfaces/chat/StoredMessage'
import Dexie, { type EntityTable, type Table } from 'dexie'
import type { ChatState } from '@/chat/interfaces/chat/ChatState'
import type { KeyBundle } from '@/device/interfaces/KeyBundle'

const DB_SCHEMA = 'veil-db'

export const KEYS_STORE = 'keys'
export const PRE_KEYS_STORE = 'pre-keys'
export const MESSAGES_STORE = 'messages'
export const DEVICE_KEYS_STORE = 'device-keys'
export const CHAT_STATES_STORE = 'chat-states'

export const IDENTITY_KEY_BUNDLE_KEY = 'idKey'

export class VeilDb extends Dexie {
  [KEYS_STORE]!: Table<KeyBundle, string>;
  [PRE_KEYS_STORE]!: EntityTable<OneTimePreKeyState, 'id'>;
  [MESSAGES_STORE]!: EntityTable<StoredMessage, 'id'>;
  [CHAT_STATES_STORE]!: EntityTable<ChatState, 'deviceId'>

  constructor() {
    super(DB_SCHEMA)
    this.version(3).stores({
      [KEYS_STORE]: ', deviceId', // Outbound Primary Key
      [PRE_KEYS_STORE]: 'id, createdAt', // Always provide "keys" (Outbound Primary Key)
      [MESSAGES_STORE]: 'id, chatId, senderId, recipientId, createdAt, [chatId+createdAt]', // Always provide "keys" (Outbound Primary Key)
      [CHAT_STATES_STORE]: 'deviceId, userId',
    })
  }
}

const db = new VeilDb()

export { db }
