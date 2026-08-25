import type { InitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dhTypes'

export interface LocalOneTimePreKey {
  id: string
  keyPair: InitialDeviceKeyMaterial['oneTimePreKeys'][number]
  publicKeyBytes: Uint8Array<ArrayBuffer>
  createdAt: Date
}
