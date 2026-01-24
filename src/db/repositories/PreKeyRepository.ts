import type { OneTimePreKeyState } from '@/device/types/OneTimePreKeyState'
import { PRE_KEYS_STORE } from '../veilDB'
import { useDbStore } from '../dbStore'

export class PreKeyRepository {
  private get db() {
    return useDbStore().db
  }

  async getPreKeyById(preKeyId: string): Promise<OneTimePreKeyState | undefined> {
    return this.db[PRE_KEYS_STORE].get(preKeyId)
  }

  async deletePreKeyById(preKeyId: string): Promise<void> {
    return this.db[PRE_KEYS_STORE].delete(preKeyId)
  }
}

export const preKeyRepository = new PreKeyRepository()
