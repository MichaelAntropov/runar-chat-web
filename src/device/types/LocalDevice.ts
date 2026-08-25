import type { InitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dhTypes'

export interface LocalSignedPreKey {
  id: string
  keyPair: InitialDeviceKeyMaterial['signedPreKey']['keyPair']
  publicKeyBytes: Uint8Array<ArrayBuffer>
  signature: InitialDeviceKeyMaterial['signedPreKey']['signature']
  createdAt: Date
}

export interface LocalOneTimePreKey {
  id: string
  keyPair: InitialDeviceKeyMaterial['oneTimePreKeys'][number]
  publicKeyBytes: Uint8Array<ArrayBuffer>
  createdAt: Date
}

export interface LocalDevice {
  deviceId: string
  userId: string
  identityX25519: InitialDeviceKeyMaterial['identityX25519']
  identityX25519PublicKeyBytes: Uint8Array<ArrayBuffer>
  identityEd25519: InitialDeviceKeyMaterial['identityEd25519']
  identityEd25519PublicKeyBytes: Uint8Array<ArrayBuffer>
  signedPreKey: LocalSignedPreKey
  oneTimePreKeys: LocalOneTimePreKey[]
}
