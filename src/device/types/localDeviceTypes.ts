import type { generateInitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dh'

import type { LocalDevice, LocalOneTimePreKey, LocalSignedPreKey } from '../entities/localDeviceEntities'

import type { RegisterDeviceRequest } from './RegisterDeviceRequest'
import type { RegisterDeviceResponse } from './RegisterDeviceResponses'

export type DeviceBootstrapStatus =
  | 'idle'
  | 'waiting-for-database'
  | 'loading-local-device'
  | 'generating-keys'
  | 'registering'
  | 'persisting'
  | 'upgrading-auth'
  | 'ready'
  | 'recovery-required'
  | 'error'

export type DeviceRegistrationStatus = 'loading' | 'incomplete' | 'generating' | 'registering' | 'registered' | 'error'

export type DeviceRecoveryStatus = 'none' | 'required' | 'processing' | 'error'

export interface LocalDeviceKeyMaterial {
  device: LocalDevice
  signedPreKey: LocalSignedPreKey
  oneTimePreKeys: LocalOneTimePreKey[]
}

export type LocalDeviceLoadResult =
  | { status: 'found'; keyMaterial: LocalDeviceKeyMaterial }
  | { status: 'not-found' }
  | { status: 'invalid'; reason: string }

export interface DeviceRegistrationDependencies {
  generateKeyMaterial?: typeof generateInitialDeviceKeyMaterial
  register: (request: RegisterDeviceRequest) => Promise<RegisterDeviceResponse>
}

export interface RegisterLocalDeviceOptions {
  userId: string
  deviceName: string
}
