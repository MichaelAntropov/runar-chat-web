import { defineStore } from 'pinia'
import {
  DB_ENCRYPTION_STORE,
  DB_ENCRYPTION_STORE_KEY,
  DB_SCHEMA,
  DB_VERSION,
  ENCRYPTED_STORES,
  RunarDb,
} from './RunarDB'
import { computed, ref, type Ref } from 'vue'
import { useUserStore } from '@/user/userStore'
import { applyEncryptionMiddleware } from 'dexie-encrypted'
import type { IndexableType } from 'dexie'
import { dbEncryptionRepository } from './repositories/dbEncryptionRepository'
import { decryptDEK, encryptDEK } from './crypto/dek'

export type DbStatus = 'initializing' | 'setup-required' | 'unlock-required' | 'ready' | 'error'

export const useDbStore = defineStore('db', () => {
  const dbInstance: Ref<RunarDb | null> = ref(null)
  const dbStatus: Ref<DbStatus | null> = ref('initializing')
  const dek: Ref<Uint8Array<ArrayBuffer> | null> = ref(null)

  const userStore = useUserStore()

  async function init() {
    const userId = userStore.principal?.id
    if (!userId) return

    const discoveryDb = new RunarDb(userId)
    discoveryDb.version(DB_VERSION).stores(DB_SCHEMA)

    try {
      const state = await discoveryDb.table(DB_ENCRYPTION_STORE).get(DB_ENCRYPTION_STORE_KEY)
      discoveryDb.close()

      if (!state) {
        dbStatus.value = 'setup-required'
      } else if (state.isEncrypted) {
        dbStatus.value = 'unlock-required'
      } else {
        await startDb(null) // Start without encryption
      }
    } catch (e) {
      console.error('Failed to initialize DB', e)
      dbStatus.value = 'error'
    }
  }

  async function startDb(key: Uint8Array<ArrayBuffer> | null) {
    console.log('[dbStore] - Starting DB')
    const userId = userStore.principal?.id
    if (!userId) return

    const veilDb = new RunarDb(userId)

    if (key) {
      console.log('[dbStore] - Starting DB with encryption')
      dek.value = key
      applyEncryptionMiddleware(veilDb, key, ENCRYPTED_STORES, async () => {
        console.error('Encryption key rotated')
      })
    }

    veilDb.version(DB_VERSION).stores(DB_SCHEMA)

    dbInstance.value = veilDb
    dbStatus.value = 'ready'
  }

  async function setupEncryption(pin: string | null) {
    console.log('[dbStore] - Setting up DB encryption, pin:', pin)
    if (!pin) {
      await startDb(null)

      await dbEncryptionRepository.saveState({
        isEncrypted: false,
        encryptedDek: null,
        dekSalt: null,
        iv: null,
      })
    } else {
      // Generate random DEK and encrypt
      const dek = window.crypto.getRandomValues(new Uint8Array(32))
      const result = await encryptDEK(dek, pin)

      await startDb(dek)

      await dbEncryptionRepository.saveState({
        isEncrypted: true,
        dekSalt: result.salt,
        encryptedDek: result.encryptedDek,
        iv: result.iv,
      })
    }
  }

  async function unlockDb(pin: string) {
    const userId = userStore.principal?.id
    if (!userId) return

    const discoveryDb = new RunarDb(userId)
    discoveryDb.version(DB_VERSION).stores(DB_SCHEMA)
    const state = await discoveryDb.table(DB_ENCRYPTION_STORE).get(DB_ENCRYPTION_STORE_KEY)
    await discoveryDb.close()

    const key = await decryptDEK(state!.encryptedDek!, pin, state!.dekSalt!, state!.iv!)

    await startDb(key)
  }

  async function archiveCurrentDatabase(): Promise<void> {
    const sourceDb = dbInstance.value
    const userId = userStore.principal?.id

    if (!sourceDb || !userId || dbStatus.value !== 'ready') {
      throw new Error('Cannot archive the local database before it is ready.')
    }

    const encryptionState = await sourceDb.table(DB_ENCRYPTION_STORE).get(DB_ENCRYPTION_STORE_KEY)
    const encryptionKey = dek.value
    const archiveName = `runar-db-${userId}-removed-${Date.now()}`
    const archiveDb = new RunarDb(archiveName, archiveName)
    let archiveCompleted = false
    let sourceDeleted = false

    sourceDb.close()
    dbInstance.value = null
    dbStatus.value = 'initializing'

    try {
      if (encryptionKey) {
        applyEncryptionMiddleware(archiveDb, encryptionKey, ENCRYPTED_STORES, async () => {
          console.error('[dbStore] - Archive encryption key rotated')
        })
      }

      archiveDb.version(DB_VERSION).stores(DB_SCHEMA)
      await sourceDb.open()
      await archiveDb.open()

      for (const tableName of Object.keys(DB_SCHEMA)) {
        await copyTable(sourceDb, archiveDb, tableName)
      }

      for (const tableName of Object.keys(DB_SCHEMA)) {
        const sourceCount = await sourceDb.table(tableName).count()
        const archiveCount = await archiveDb.table(tableName).count()
        if (sourceCount !== archiveCount) {
          throw new Error(`Database archive verification failed for table ${tableName}.`)
        }
      }

      archiveCompleted = true

      await sourceDb.close()
      await archiveDb.close()
      await sourceDb.delete()
      sourceDeleted = true

      const replacementDb = new RunarDb(userId)
      if (encryptionKey) {
        applyEncryptionMiddleware(replacementDb, encryptionKey, ENCRYPTED_STORES, async () => {
          console.error('[dbStore] - Replacement database encryption key rotated')
        })
      }
      replacementDb.version(DB_VERSION).stores(DB_SCHEMA)
      await replacementDb.open()

      if (encryptionState) {
        await replacementDb.table(DB_ENCRYPTION_STORE).put(encryptionState, DB_ENCRYPTION_STORE_KEY)
      }

      dbInstance.value = replacementDb
      dbStatus.value = 'ready'
    } catch (error) {
      if (!archiveCompleted) {
        try {
          await archiveDb.close()
          await archiveDb.delete()
        } catch (archiveCleanupError) {
          console.error('[dbStore] - Failed to clean up incomplete archive:', archiveCleanupError)
        }
      }

      if (!sourceDeleted) {
        try {
          await sourceDb.open()
          dbInstance.value = sourceDb
          dbStatus.value = 'ready'
        } catch (restoreError) {
          console.error('[dbStore] - Failed to restore the original database:', restoreError)
          dbStatus.value = 'error'
        }
      } else {
        dbStatus.value = 'error'
      }

      throw error
    } finally {
      dek.value = encryptionKey
    }
  }

  function resetDb() {
    if (dbInstance.value) {
      dbInstance.value.close()
      dbInstance.value = null
    }
  }

  const db = computed(() => {
    if (!dbInstance.value) {
      throw new Error(
        'Database accessed before initialization. ' +
          "Ensure the UI is guarding this via dbStore.dbStatus === 'ready'",
      )
    }
    return dbInstance.value
  })

  return {
    db,
    dbStatus,
    init,
    setupEncryption,
    unlockDb,
    resetDb,
    archiveCurrentDatabase,
  }
})

async function copyTable(sourceDb: RunarDb, targetDb: RunarDb, tableName: string): Promise<void> {
  const records: Array<{ key: IndexableType; value: unknown }> = []

  await sourceDb
    .table(tableName)
    .toCollection()
    .each((value, cursor) => {
      records.push({ key: cursor.primaryKey as IndexableType, value })
    })

  const targetTable = targetDb.table(tableName)
  for (const record of records) {
    await targetTable.put(record.value, record.key)
  }
}
