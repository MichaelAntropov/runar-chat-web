import type { DirectMessageEncryptedMessage } from './DirectMessageEncryptedMessage'

export interface DirectMessageDecryptionInput {
  readonly senderUserId: string
  readonly senderDeviceId: string
  readonly encryptedMessage: DirectMessageEncryptedMessage
  readonly receivedAt: number
}
