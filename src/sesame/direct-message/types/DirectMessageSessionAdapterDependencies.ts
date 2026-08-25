import type { SesameRemoteDevice } from '@/sesame/types/sesameSessionAdapter'

import type { DirectMessageLocalIdentity } from './DirectMessageLocalIdentity'
import type { DirectMessageLocalKeySource } from './DirectMessageLocalKeySource'
import type { DirectMessagePreKeyBundle } from './DirectMessagePreKeyBundle'

export interface DirectMessageSessionAdapterDependencies {
  readonly localIdentity: DirectMessageLocalIdentity
  readonly localKeySource: DirectMessageLocalKeySource
  readonly loadPreKeyBundle: (remoteDevice: SesameRemoteDevice) => Promise<DirectMessagePreKeyBundle>
  readonly createSessionId?: () => string
}
