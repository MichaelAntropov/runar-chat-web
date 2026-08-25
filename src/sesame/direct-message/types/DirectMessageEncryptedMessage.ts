import type { DoubleRatchetCipherText, EncodedDoubleRatchetHeader } from '@/crypto/double-ratchet/doubleRatchetTypes'

export interface DirectMessageEncryptedMessage {
  readonly receiverSignedPreKeyId: string | null
  readonly receiverOneTimePreKeyId: string | null
  readonly senderEphemeralKey: Uint8Array<ArrayBuffer> | null
  readonly encryptedHeader: EncodedDoubleRatchetHeader
  readonly cipherPayload: DoubleRatchetCipherText
}
