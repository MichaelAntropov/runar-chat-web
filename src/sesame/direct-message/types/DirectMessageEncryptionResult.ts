import type { SesameEncryptedDeviceMessage } from '@/sesame/sesameMessageProcessing'

import type { DirectMessageEncryptedMessage } from './DirectMessageEncryptedMessage'

export interface DirectMessageEncryptionResult {
  readonly deviceMessages: readonly SesameEncryptedDeviceMessage<DirectMessageEncryptedMessage>[]
}
