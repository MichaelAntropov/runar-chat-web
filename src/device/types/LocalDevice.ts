import type { InitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dhTypes'

export interface LocalDevice {
  deviceId: string
  userId: string
  activeSignedPreKeyId: string
  identityX25519: InitialDeviceKeyMaterial['identityX25519']
  identityX25519PublicKeyBytes: Uint8Array<ArrayBuffer>
  identityEd25519: InitialDeviceKeyMaterial['identityEd25519']
  identityEd25519PublicKeyBytes: Uint8Array<ArrayBuffer>
}
