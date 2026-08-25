import type { LocalDeviceKeyMaterial } from './LocalDeviceKeyMaterial'

export type LocalDeviceLoadResult =
  | { status: 'found'; keyMaterial: LocalDeviceKeyMaterial }
  | { status: 'not-found' }
  | { status: 'invalid'; reason: string }
