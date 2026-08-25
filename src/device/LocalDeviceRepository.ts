import type { RunarDb } from '@/db/RunarDB'
import { IDENTITY_KEY_BUNDLE_KEY, KEYS_STORE } from '@/db/RunarDB'

import type { LocalDevice } from './types/LocalDevice'
import type { LocalDeviceLoadResult } from './types/LocalDeviceLoadResult'

export class LocalDeviceRepository {
  constructor(private readonly db: RunarDb) {}

  async load(userId: string): Promise<LocalDeviceLoadResult> {
    const value: unknown = await this.db[KEYS_STORE].get(IDENTITY_KEY_BUNDLE_KEY)
    if (value === undefined) return { status: 'not-found' }

    if (!isLocalDevice(value, userId)) {
      return { status: 'invalid', reason: 'The stored local-device record is incomplete or stale.' }
    }

    return { status: 'found', device: value }
  }

  async save(device: LocalDevice): Promise<void> {
    await this.db[KEYS_STORE].put(device, IDENTITY_KEY_BUNDLE_KEY)
  }
}

function isLocalDevice(value: unknown, userId: string): value is LocalDevice {
  if (!value || typeof value !== 'object') return false

  const device = value as Partial<LocalDevice>
  return (
    typeof device.deviceId === 'string' &&
    device.deviceId.length > 0 &&
    device.userId === userId &&
    isKeyPair(device.identityX25519) &&
    device.identityX25519PublicKeyBytes instanceof Uint8Array &&
    isKeyPair(device.identityEd25519) &&
    device.identityEd25519PublicKeyBytes instanceof Uint8Array &&
    !!device.signedPreKey &&
    typeof device.signedPreKey.id === 'string' &&
    isKeyPair(device.signedPreKey.keyPair) &&
    device.signedPreKey.publicKeyBytes instanceof Uint8Array &&
    device.signedPreKey.signature instanceof Uint8Array &&
    isValidDate(device.signedPreKey.createdAt) &&
    Array.isArray(device.oneTimePreKeys) &&
    device.oneTimePreKeys.every(
      (key) =>
        typeof key.id === 'string' &&
        isKeyPair(key.keyPair) &&
        key.publicKeyBytes instanceof Uint8Array &&
        isValidDate(key.createdAt)
    )
  )
}

function isKeyPair(value: unknown): value is { secretKey: CryptoKey; publicKey: CryptoKey } {
  if (!value || typeof value !== 'object') return false
  const keyPair = value as { secretKey?: unknown; publicKey?: unknown }
  return isCryptoKey(keyPair.secretKey) && isCryptoKey(keyPair.publicKey)
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    'algorithm' in value &&
    'usages' in value
  )
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}
