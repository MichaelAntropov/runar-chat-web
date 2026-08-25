import Dexie, { type EntityTable, type Table } from 'dexie'
import { NON_INDEXED_FIELDS } from 'dexie-encrypted'

import type { ChatState } from '@/chat/types/chat/ChatState'
import type { StoredMessage } from '@/chat/types/chat/StoredMessage'
import type { PendingReadReceipt } from '@/chat/types/receipt/PendingReadReceipt'
import type { LocalDevice } from '@/device/types/LocalDevice'
import type { LocalOneTimePreKey } from '@/device/types/LocalOneTimePreKey'
import type { LocalSignedPreKey } from '@/device/types/LocalSignedPreKey'
import type { SesameDevice as SesameDevice } from '@/sesame/entities/SesameDeviceEntity'
import type { SesameSession as SesameSession } from '@/sesame/entities/SesameSessionEntity'
import type { SesameUser as SesameUser } from '@/sesame/entities/SesameUserEntity'
import type { DeviceSettings } from '@/settings/types/DeviceSettings'

import type { DbEncryptionState } from './types/DbEncryptionState'

const DB_SCHEMA_PREFIX = 'runar-db-'

export const LOCAL_DEVICE_STORE = 'local-device'
export const LOCAL_SIGNED_PRE_KEYS_STORE = 'local-signed-pre-keys'
export const LOCAL_ONE_TIME_PRE_KEYS_STORE = 'local-one-time-pre-keys'
export const SESAME_USERS_STORE = 'sesame-users'
export const SESAME_DEVICES_STORE = 'sesame-devices'
export const SESAME_SESSIONS_STORE = 'sesame-sessions'
export const MESSAGES_STORE = 'messages'
export const CHATS_STORE = 'chats'
export const CONTACTS_STORE = 'contacts'
export const CHAT_STATES_STORE = 'chat-states'
export const DB_ENCRYPTION_STORE = 'db-encryption-state'
export const DB_ENCRYPTION_SETTINGS = '_encryptionSettings'
export const DEVICE_SETTINGS_STORE = 'device-settings'
export const PENDING_READ_RECEIPTS_STORE = 'pending-read-receipts'

export const LOCAL_DEVICE_KEY = 'localDevice'
export const DB_ENCRYPTION_STORE_KEY = 'idKey'
export const CHATS_STORE_KEY = 'idKey'
export const CONTACTS_STORE_KEY = 'idKey'
export const DEVICE_SETTINGS_STORE_KEY = 'deviceSettings'

export const DB_VERSION = 5

export const DB_SCHEMA = {
  [LOCAL_DEVICE_STORE]: '',
  [LOCAL_SIGNED_PRE_KEYS_STORE]: 'id, createdAt, retiredAt',
  [LOCAL_ONE_TIME_PRE_KEYS_STORE]: 'id, createdAt',
  [SESAME_USERS_STORE]: 'userId, staleSince',
  [SESAME_DEVICES_STORE]: '[userId+deviceId], userId, deviceId, staleSince',
  [SESAME_SESSIONS_STORE]: 'sessionId, [userId+deviceId], userId, deviceId, lastUsedAt',
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
  [LOCAL_DEVICE_STORE]!: Table<LocalDevice, string>;
  [LOCAL_SIGNED_PRE_KEYS_STORE]!: EntityTable<LocalSignedPreKey, 'id'>;
  [LOCAL_ONE_TIME_PRE_KEYS_STORE]!: EntityTable<LocalOneTimePreKey, 'id'>;
  [SESAME_USERS_STORE]!: EntityTable<SesameUser, 'userId'>;
  [SESAME_DEVICES_STORE]!: Table<SesameDevice, [string, string]>;
  [SESAME_SESSIONS_STORE]!: EntityTable<SesameSession, 'sessionId'>;
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

export function configureRunarDbSchema(db: RunarDb): void {
  db.version(DB_VERSION).stores(DB_SCHEMA)
}
