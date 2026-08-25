import type { SesameSessionAdapter } from '@/sesame/types/sesameSessionAdapter'
import type { SesameDeviceIdentityTuple, SesameLimits, SesameLocalAddress } from '@/sesame/types/sesameTypes'

import type { DirectMessageEncryptedMessage } from './DirectMessageEncryptedMessage'
import type { DirectMessageInitiationData } from './DirectMessageInitiationData'
import type { DirectMessagePersistence } from './DirectMessagePersistence'
import type { DirectMessageSessionState } from './DirectMessageSessionState'

export interface DirectMessageCoordinatorDependencies {
  readonly persistence: DirectMessagePersistence
  readonly sessionAdapter: SesameSessionAdapter<DirectMessageSessionState, DirectMessageInitiationData, DirectMessageEncryptedMessage>
  readonly loadDeviceIdentities: (userId: string) => Promise<readonly SesameDeviceIdentityTuple[]>
  readonly localAddress: SesameLocalAddress
  readonly limits: SesameLimits
  readonly now?: () => number
}
