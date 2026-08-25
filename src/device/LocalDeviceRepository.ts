import type { RunarDb } from '@/db/RunarDB'
import { LOCAL_DEVICE_KEY, LOCAL_DEVICE_STORE, LOCAL_ONE_TIME_PRE_KEYS_STORE, LOCAL_SIGNED_PRE_KEYS_STORE } from '@/db/RunarDB'

import type { LocalDevice, LocalOneTimePreKey, LocalSignedPreKey } from './entities/localDeviceEntities'
import type { LocalDeviceKeyMaterial, LocalDeviceLoadResult } from './types/localDeviceTypes'

export class LocalDeviceRepository {
  constructor(private readonly db: RunarDb) {}

  async load(userId: string): Promise<LocalDeviceLoadResult> {
    const value: unknown = await this.db[LOCAL_DEVICE_STORE].get(LOCAL_DEVICE_KEY)
    if (value === undefined) return { status: 'not-found' }
    if (!isLocalDevice(value, userId)) return invalidLocalDeviceResult()

    const [signedPreKeyValue, oneTimePreKeyValues] = await Promise.all([
      this.db[LOCAL_SIGNED_PRE_KEYS_STORE].get(value.activeSignedPreKeyId),
      this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE].toArray(),
    ])

    if (!isLocalSignedPreKey(signedPreKeyValue) || oneTimePreKeyValues.some((key) => !isLocalOneTimePreKey(key))) {
      return invalidLocalDeviceResult()
    }

    return {
      status: 'found',
      keyMaterial: {
        device: value,
        signedPreKey: signedPreKeyValue,
        oneTimePreKeys: oneTimePreKeyValues,
      },
    }
  }

  async saveRegistration(keyMaterial: LocalDeviceKeyMaterial): Promise<void> {
    const { device, oneTimePreKeys, signedPreKey } = keyMaterial
    if (device.activeSignedPreKeyId !== signedPreKey.id) {
      throw new Error('The local device must reference the signed pre-key being registered.')
    }

    await this.db.transaction(
      'rw',
      this.db[LOCAL_DEVICE_STORE],
      this.db[LOCAL_SIGNED_PRE_KEYS_STORE],
      this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE],
      async () => {
        await this.db[LOCAL_DEVICE_STORE].add(device, LOCAL_DEVICE_KEY)
        await this.db[LOCAL_SIGNED_PRE_KEYS_STORE].add(signedPreKey)
        await this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE].bulkAdd(oneTimePreKeys)
      }
    )
  }

  async getSignedPreKey(id: string): Promise<LocalSignedPreKey | undefined> {
    return this.db[LOCAL_SIGNED_PRE_KEYS_STORE].get(id)
  }

  async getOneTimePreKey(id: string): Promise<LocalOneTimePreKey | undefined> {
    return this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE].get(id)
  }

  async consumeOneTimePreKey(id: string): Promise<LocalOneTimePreKey | undefined> {
    return this.db.transaction('rw', this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE], async () => {
      const key = await this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE].get(id)
      if (!key) return undefined

      await this.db[LOCAL_ONE_TIME_PRE_KEYS_STORE].delete(id)
      return key
    })
  }
}

function invalidLocalDeviceResult(): LocalDeviceLoadResult {
  return { status: 'invalid', reason: 'The stored local-device key material is incomplete.' }
}

function isLocalDevice(value: unknown, userId: string): value is LocalDevice {
  if (!value || typeof value !== 'object') return false

  const device = value as Partial<LocalDevice>
  return (
    typeof device.deviceId === 'string' &&
    device.deviceId.length > 0 &&
    device.userId === userId &&
    typeof device.activeSignedPreKeyId === 'string' &&
    device.activeSignedPreKeyId.length > 0 &&
    isKeyPair(device.identityX25519) &&
    device.identityX25519PublicKeyBytes instanceof Uint8Array &&
    isKeyPair(device.identityEd25519) &&
    device.identityEd25519PublicKeyBytes instanceof Uint8Array
  )
}

function isLocalSignedPreKey(value: unknown): value is LocalSignedPreKey {
  if (!value || typeof value !== 'object') return false

  const key = value as Partial<LocalSignedPreKey>
  return (
    typeof key.id === 'string' &&
    key.id.length > 0 &&
    isKeyPair(key.keyPair) &&
    key.publicKeyBytes instanceof Uint8Array &&
    key.signature instanceof Uint8Array &&
    isValidDate(key.createdAt) &&
    (key.retiredAt === null || isValidDate(key.retiredAt))
  )
}

function isLocalOneTimePreKey(value: unknown): value is LocalOneTimePreKey {
  if (!value || typeof value !== 'object') return false

  const key = value as Partial<LocalOneTimePreKey>
  return (
    typeof key.id === 'string' &&
    key.id.length > 0 &&
    isKeyPair(key.keyPair) &&
    key.publicKeyBytes instanceof Uint8Array &&
    isValidDate(key.createdAt)
  )
}

function isKeyPair(value: unknown): value is { secretKey: CryptoKey; publicKey: CryptoKey } {
  if (!value || typeof value !== 'object') return false
  const keyPair = value as { secretKey?: unknown; publicKey?: unknown }
  return isCryptoKey(keyPair.secretKey) && isCryptoKey(keyPair.publicKey)
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return !!value && typeof value === 'object' && 'type' in value && 'algorithm' in value && 'usages' in value
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}
