import Dexie, { type EntityTable, type Table } from 'dexie'
import { NON_INDEXED_FIELDS } from 'dexie-encrypted'

import type { ChatState } from '@/chat/types/chat/ChatState'
import type { StoredMessage } from '@/chat/types/chat/StoredMessage'
import type { PendingReadReceipt } from '@/chat/types/receipt/PendingReadReceipt'
import type { KeyBundle } from '@/device/types/KeyBundle'
import type { OneTimePreKeyState } from '@/device/types/OneTimePreKeyState'
import type { DeviceSettings } from '@/settings/types/DeviceSettings'

import type { DbEncryptionState } from './types/DbEncryptionState'

const DB_SCHEMA_PREFIX = 'runar-db-'

export const KEYS_STORE = 'keys'
export const PRE_KEYS_STORE = 'pre-keys'
export const MESSAGES_STORE = 'messages'
export const CHATS_STORE = 'chats'
export const CONTACTS_STORE = 'contacts'
export const CHAT_STATES_STORE = 'chat-states'
export const DB_ENCRYPTION_STORE = 'db-encryption-state'
export const DB_ENCRYPTION_SETTINGS = '_encryptionSettings'
export const DEVICE_SETTINGS_STORE = 'device-settings'
export const PENDING_READ_RECEIPTS_STORE = 'pending-read-receipts'

export const IDENTITY_KEY_BUNDLE_KEY = 'idKey'
export const DB_ENCRYPTION_STORE_KEY = 'idKey'
export const CHATS_STORE_KEY = 'idKey'
export const CONTACTS_STORE_KEY = 'idKey'
export const DEVICE_SETTINGS_STORE_KEY = 'deviceSettings'

export const DB_VERSION = 4

export const DB_SCHEMA = {
  [KEYS_STORE]: ', deviceId',
  [PRE_KEYS_STORE]: 'id, createdAt',
  [MESSAGES_STORE]: 'id, chatId, senderId, recipientId, createdAt, [chatId+createdAt]',
  [CHATS_STORE]: '',
  [CONTACTS_STORE]: '',
  [CHAT_STATES_STORE]: 'deviceId, userId',
  [DB_ENCRYPTION_STORE]: '',
  [DB_ENCRYPTION_SETTINGS]: '++id', // Specifically to shadow dexie encryption settings table that is used in case of enabled encryption
  [DEVICE_SETTINGS_STORE]: 'id',
  [PENDING_READ_RECEIPTS_STORE]: 'messageId',
}

export const ENCRYPTED_STORES = {
  [MESSAGES_STORE]: NON_INDEXED_FIELDS,
  [CHATS_STORE]: NON_INDEXED_FIELDS,
  [CONTACTS_STORE]: NON_INDEXED_FIELDS,
  [PENDING_READ_RECEIPTS_STORE]: NON_INDEXED_FIELDS,
}

export class RunarDb extends Dexie {
  [KEYS_STORE]!: Table<KeyBundle, string>;
  [PRE_KEYS_STORE]!: EntityTable<OneTimePreKeyState, 'id'>;
  [MESSAGES_STORE]!: EntityTable<StoredMessage, 'id'>;
  [CHATS_STORE]!: Table<unknown, string>;
  [CONTACTS_STORE]!: Table<unknown, string>;
  [CHAT_STATES_STORE]!: EntityTable<ChatState, 'deviceId'>;
  [DB_ENCRYPTION_STORE]!: Table<DbEncryptionState, string>;
  [DB_ENCRYPTION_SETTINGS]!: Table<unknown, 'id'>;
  [DEVICE_SETTINGS_STORE]!: EntityTable<DeviceSettings, 'id'>;
  [PENDING_READ_RECEIPTS_STORE]!: EntityTable<PendingReadReceipt, 'messageId'>

  constructor(dbId: string, databaseName?: string) {
    super(databaseName ?? DB_SCHEMA_PREFIX + dbId)
  }
}
