import type { InitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dhTypes'

export interface LocalSignedPreKey {
  id: string
  keyPair: InitialDeviceKeyMaterial['signedPreKey']['keyPair']
  publicKeyBytes: Uint8Array<ArrayBuffer>
  signature: InitialDeviceKeyMaterial['signedPreKey']['signature']
  createdAt: Date
  retiredAt: Date | null
}
