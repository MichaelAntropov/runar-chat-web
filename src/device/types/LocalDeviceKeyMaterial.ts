import type { LocalDevice } from './LocalDevice'
import type { LocalOneTimePreKey } from './LocalOneTimePreKey'
import type { LocalSignedPreKey } from './LocalSignedPreKey'

export interface LocalDeviceKeyMaterial {
  device: LocalDevice
  signedPreKey: LocalSignedPreKey
  oneTimePreKeys: LocalOneTimePreKey[]
}
