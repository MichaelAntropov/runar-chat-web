import type { OneTimePreKeyState } from '../device/types/OneTimePreKeyState'
import type { StoredMessage } from '../chat/types/chat/StoredMessage'
import Dexie, { type EntityTable, type Table } from 'dexie'
import type { ChatState } from '@/chat/types/chat/ChatState'
import type { KeyBundle } from '@/device/types/KeyBundle'
import type { DbEncryptionState } from './types/DbEncryptionState'
import { NON_INDEXED_FIELDS } from 'dexie-encrypted'

const DB_SCHEMA_PREFIX = 'veil-db-'

export const KEYS_STORE = 'keys'
export const PRE_KEYS_STORE = 'pre-keys'
export const MESSAGES_STORE = 'messages'
export const DEVICE_KEYS_STORE = 'device-keys'
export const CHAT_STATES_STORE = 'chat-states'
export const DB_ENCRYPTION_STORE = 'db-encryption-state'
export const DB_ENCRYPTION_SETTINGS = '_encryptionSettings'

export const IDENTITY_KEY_BUNDLE_KEY = 'idKey'
export const DB_ENCRYPTION_STORE_KEY = 'idKey'

export const DB_SCHEMA = {
  [KEYS_STORE]: ', deviceId',
  [PRE_KEYS_STORE]: 'id, createdAt',
  [MESSAGES_STORE]: 'id, chatId, senderId, recipientId, createdAt, [chatId+createdAt]',
  [CHAT_STATES_STORE]: 'deviceId, userId',
  [DB_ENCRYPTION_STORE]: '',
  [DB_ENCRYPTION_SETTINGS]: '++id', // Specifically to shadow dexie encryption settings table that is used in case of enabled encryption
}

export const ENCRYPTED_STORES = {
  [MESSAGES_STORE]: NON_INDEXED_FIELDS,
}

export class VeilDb extends Dexie {
  [KEYS_STORE]!: Table<KeyBundle, string>;
  [PRE_KEYS_STORE]!: EntityTable<OneTimePreKeyState, 'id'>;
  [MESSAGES_STORE]!: EntityTable<StoredMessage, 'id'>;
  [CHAT_STATES_STORE]!: EntityTable<ChatState, 'deviceId'>;
  [DB_ENCRYPTION_STORE]!: Table<DbEncryptionState, string>;
  [DB_ENCRYPTION_SETTINGS]!: Table<unknown, 'id'>

  constructor(dbId: string) {
    super(DB_SCHEMA_PREFIX + `${dbId}`)
  }
}
