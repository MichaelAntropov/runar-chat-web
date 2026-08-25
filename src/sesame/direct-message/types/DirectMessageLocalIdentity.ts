import type { IdentityX25519PublicKey, IdentityX25519SecretKey } from '@/crypto/keys/keyTypes'

export interface DirectMessageLocalIdentity {
  readonly userId: string
  readonly deviceId: string
  readonly identityX25519SecretKey: IdentityX25519SecretKey
  readonly identityX25519PublicKey: IdentityX25519PublicKey
  readonly identityX25519PublicKeyBytes: Uint8Array<ArrayBuffer>
}
