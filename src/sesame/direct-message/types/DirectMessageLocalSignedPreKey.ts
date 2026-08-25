import type { SpkX25519PublicKey, SpkX25519SecretKey } from '@/crypto/keys/keyTypes'

export interface DirectMessageLocalSignedPreKey {
  readonly id: string
  readonly secretKey: SpkX25519SecretKey
  readonly publicKey: SpkX25519PublicKey
}
