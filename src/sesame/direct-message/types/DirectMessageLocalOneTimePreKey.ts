import type { OtpkX25519SecretKey } from '@/crypto/keys/keyTypes'

export interface DirectMessageLocalOneTimePreKey {
  readonly id: string
  readonly secretKey: OtpkX25519SecretKey
}
