import type { KeyPairState } from './KeyPairState'
import type { SignedPreKeyState } from './SignedPreKeyState'

export interface KeyBundle {
  deviceId: string
  identityX25519: KeyPairState
  identityEd25519: KeyPairState
  signedPreKey: SignedPreKeyState
}
