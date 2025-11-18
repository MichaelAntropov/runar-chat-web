import type { OneTimePreKeyState } from '@/device/types/OneTimePreKeyState'
import { db, PRE_KEYS_STORE } from '../veilDB'

export class PreKeyRepository {
  async getPreKeyById(preKeyId: string): Promise<OneTimePreKeyState | undefined> {
    return db[PRE_KEYS_STORE].get(preKeyId)
  }

  async deletePreKeyById(preKeyId: string): Promise<void> {
    return db[PRE_KEYS_STORE].delete(preKeyId)
  }
}

export const preKeyRepository = new PreKeyRepository()
