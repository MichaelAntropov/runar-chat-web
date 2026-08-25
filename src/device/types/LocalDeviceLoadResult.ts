import type { LocalDevice } from './LocalDevice'

export type LocalDeviceLoadResult =
  | { status: 'found'; device: LocalDevice }
  | { status: 'not-found' }
  | { status: 'invalid'; reason: string }
