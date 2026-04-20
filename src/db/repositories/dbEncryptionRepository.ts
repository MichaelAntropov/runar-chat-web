import { DB_ENCRYPTION_STORE, DB_ENCRYPTION_STORE_KEY } from '../RunarDB'
import { useDbStore } from '../dbStore'
import type { DbEncryptionState } from '../types/DbEncryptionState'

export class DbEncryptionRepository {
  private get db() {
    return useDbStore().db
  }

  async getDbEncryptionState(): Promise<DbEncryptionState | undefined> {
    return this.db[DB_ENCRYPTION_STORE].get(DB_ENCRYPTION_STORE_KEY)
  }

  async addState(state: DbEncryptionState): Promise<string> {
    return this.db[DB_ENCRYPTION_STORE].add(state, DB_ENCRYPTION_STORE_KEY)
  }

  async saveState(state: DbEncryptionState): Promise<string> {
    return this.db[DB_ENCRYPTION_STORE].put(state, DB_ENCRYPTION_STORE_KEY)
  }
}

export const dbEncryptionRepository = new DbEncryptionRepository()
