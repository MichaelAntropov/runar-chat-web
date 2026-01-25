import { defineStore } from 'pinia'
import {
  DB_ENCRYPTION_STORE,
  DB_ENCRYPTION_STORE_KEY,
  DB_SCHEMA,
  DB_VERSION,
  ENCRYPTED_STORES,
  VeilDb,
} from './VeilDB'
import { computed, ref, type Ref } from 'vue'
import { useUserStore } from '@/user/userStore'
import { applyEncryptionMiddleware } from 'dexie-encrypted'
import { dbEncryptionRepository } from './repositories/dbEncryptionRepository'
import { decryptDEK, encryptDEK } from './crypto/dek'

export type DbStatus = 'initializing' | 'setup-required' | 'unlock-required' | 'ready' | 'error'

export const useDbStore = defineStore('db', () => {
  const dbInstance: Ref<VeilDb | null> = ref(null)
  const dbStatus: Ref<DbStatus | null> = ref('initializing')
  const dek: Ref<Uint8Array<ArrayBuffer> | null> = ref(null)

  const userStore = useUserStore()

  async function init() {
    const userId = userStore.principal?.id
    if (!userId) return

    const discoveryDb = new VeilDb(userId)
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

    const veilDb = new VeilDb(userId)

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

    const discoveryDb = new VeilDb(userId)
    discoveryDb.version(DB_VERSION).stores(DB_SCHEMA)
    const state = await discoveryDb.table(DB_ENCRYPTION_STORE).get(DB_ENCRYPTION_STORE_KEY)
    await discoveryDb.close()

    const key = await decryptDEK(state!.encryptedDek!, pin, state!.dekSalt!, state!.iv!)

    await startDb(key)
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
  }
})
