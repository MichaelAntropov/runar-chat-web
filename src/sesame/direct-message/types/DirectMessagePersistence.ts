import type { SesameUserRecord } from '@/sesame/types/sesameTypes'
import type { SesameUserProjection } from '@/sesame/types/sesameUserProjection'

import type { DirectMessageInitiationData } from './DirectMessageInitiationData'
import type { DirectMessageSessionState } from './DirectMessageSessionState'

export interface DirectMessagePersistence {
  loadUserRecord(userId: string): Promise<SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData> | null>

  saveUserRecord(
    previous: SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData> | null,
    nextUserRecord: SesameUserRecord<DirectMessageSessionState, DirectMessageInitiationData>
  ): Promise<SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData>>

  saveReceivedUserRecord(
    previous: SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData> | null,
    nextUserRecord: SesameUserRecord<DirectMessageSessionState, DirectMessageInitiationData>,
    consumedOneTimePreKeyId: string | null
  ): Promise<SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData>>
}
