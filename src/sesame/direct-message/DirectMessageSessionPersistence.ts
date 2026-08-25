import type { RunarDb } from '@/db/RunarDB'
import { LOCAL_ONE_TIME_PRE_KEYS_STORE, SESAME_DEVICES_STORE, SESAME_SESSIONS_STORE, SESAME_USERS_STORE } from '@/db/RunarDB'
import { SesameRepository } from '@/sesame/SesameRepository'
import type { SesameUserRecord } from '@/sesame/types/sesameTypes'
import type { SesameUserProjection } from '@/sesame/types/sesameUserProjection'

import type { DirectMessageInitiationData } from './types/DirectMessageInitiationData'
import type { DirectMessagePersistence } from './types/DirectMessagePersistence'
import { DirectMessageSessionError } from './types/DirectMessageSessionError'
import type { DirectMessageSessionState } from './types/DirectMessageSessionState'

type Projection = SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData>
type UserRecord = SesameUserRecord<DirectMessageSessionState, DirectMessageInitiationData>

export class DirectMessageSessionPersistence implements DirectMessagePersistence {
  private readonly sesameRepository: SesameRepository<DirectMessageSessionState, DirectMessageInitiationData>

  constructor(private readonly db: RunarDb) {
    this.sesameRepository = new SesameRepository(db)
  }

  loadUserRecord(userId: string): Promise<Projection | null> {
    return this.sesameRepository.loadUserRecord(userId)
  }

  saveUserRecord(previous: Projection | null, nextUserRecord: UserRecord): Promise<Projection> {
    return this.sesameRepository.saveUserRecord(previous, nextUserRecord)
  }

  async saveReceivedUserRecord(previous: Projection | null, nextUserRecord: UserRecord, consumedOneTimePreKeyId: string | null): Promise<Projection> {
    if (consumedOneTimePreKeyId === null) {
      return this.sesameRepository.saveUserRecord(previous, nextUserRecord)
    }

    return this.db.transaction(
      'rw',
      this.db[SESAME_USERS_STORE],
      this.db[SESAME_DEVICES_STORE],
      this.db[SESAME_SESSIONS_STORE],
      this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE],
      async () => {
        const oneTimePreKey = await this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE].get(consumedOneTimePreKeyId)
        if (oneTimePreKey === undefined) {
          throw new DirectMessageSessionError('The one-time pre-key used by the receiving session is unavailable')
        }

        const saved = await this.sesameRepository.saveUserRecordInCurrentTransaction(previous, nextUserRecord)
        await this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE].delete(consumedOneTimePreKeyId)
        return saved
      }
    )
  }
}
