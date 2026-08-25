import type { OneTimePreKeyState } from '@/device/types/OneTimePreKeyState'
import { LOCAL_ONE_TIME_PRE_KEYS_STORE } from '../RunarDB'
import { useDbStore } from '../dbStore'

export class PreKeyRepository {
  private get db() {
    return useDbStore().db
  }

  async getPreKeyById(preKeyId: string): Promise<OneTimePreKeyState | undefined> {
    const key = await this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE].get(preKeyId)
    if (!key) return undefined

    return {
      id: key.id,
      createdAt: key.createdAt,
      keyPair: {
        privateKey: key.keyPair.secretKey,
        publicKey: key.keyPair.publicKey,
      },
      publicKey: key.publicKeyBytes,
    }
  }

  async deletePreKeyById(preKeyId: string): Promise<void> {
    return this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE].delete(preKeyId)
  }
}

export const preKeyRepository = new PreKeyRepository()
