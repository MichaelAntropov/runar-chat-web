import { describe, expect, it, vi } from 'vitest'

import type { RunarDb } from '@/db/RunarDB'
import {
  LOCAL_DEVICE_STORE,
  LOCAL_ONE_TIME_PRE_KEYS_STORE,
  LOCAL_SIGNED_PRE_KEYS_STORE,
} from '@/db/RunarDB'

import { LocalDeviceRepository } from '../LocalDeviceRepository'
import type { LocalDeviceKeyMaterial } from '../types/LocalDeviceKeyMaterial'

describe('LocalDeviceRepository', () => {
  it('loads the device and active signed pre-key with no remaining OTPKs', async () => {
    const keyMaterial = createKeyMaterial()
    keyMaterial.oneTimePreKeys = []
    const { db } = createDb(keyMaterial)

    const result = await new LocalDeviceRepository(db).load(keyMaterial.device.userId)

    expect(result).toEqual({ status: 'found', keyMaterial })
  })

  it('persists registration across all key stores in one transaction', async () => {
    const keyMaterial = createKeyMaterial()
    const { db, deviceTable, oneTimePreKeyTable, signedPreKeyTable, transaction } =
      createDb()

    await new LocalDeviceRepository(db).saveRegistration(keyMaterial)

    expect(transaction).toHaveBeenCalledOnce()
    expect(deviceTable.add).toHaveBeenCalledWith(keyMaterial.device, 'localDevice')
    expect(signedPreKeyTable.add).toHaveBeenCalledWith(keyMaterial.signedPreKey)
    expect(oneTimePreKeyTable.bulkAdd).toHaveBeenCalledWith(keyMaterial.oneTimePreKeys)
  })

  it('consumes exactly one OTPK atomically', async () => {
    const keyMaterial = createKeyMaterial()
    const { db, oneTimePreKeyTable, transaction } = createDb(keyMaterial)
    const key = keyMaterial.oneTimePreKeys[0]

    const consumed = await new LocalDeviceRepository(db).consumeOneTimePreKey(key.id)

    expect(consumed).toBe(key)
    expect(transaction).toHaveBeenCalledOnce()
    expect(oneTimePreKeyTable.delete).toHaveBeenCalledWith(key.id)
  })

  it('rejects a device whose active signed pre-key row is missing', async () => {
    const keyMaterial = createKeyMaterial()
    const { db, signedPreKeyTable } = createDb(keyMaterial)
    signedPreKeyTable.get.mockResolvedValue(undefined)

    const result = await new LocalDeviceRepository(db).load(keyMaterial.device.userId)

    expect(result.status).toBe('invalid')
  })
})

function createDb(keyMaterial?: LocalDeviceKeyMaterial) {
  const deviceTable = {
    add: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(keyMaterial?.device),
  }
  const signedPreKeyTable = {
    add: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(keyMaterial?.signedPreKey),
  }
  const oneTimePreKeyTable = {
    bulkAdd: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(async (id: string) => keyMaterial?.oneTimePreKeys.find((key) => key.id === id)),
    toArray: vi.fn().mockResolvedValue(keyMaterial?.oneTimePreKeys ?? []),
  }
  const transaction = vi.fn(async (...args: unknown[]) => {
    const operation = args.at(-1) as () => Promise<unknown>
    return operation()
  })
  const db = {
    [LOCAL_DEVICE_STORE]: deviceTable,
    [LOCAL_SIGNED_PRE_KEYS_STORE]: signedPreKeyTable,
    [LOCAL_ONE_TIME_PRE_KEYS_STORE]: oneTimePreKeyTable,
    transaction,
  } as unknown as RunarDb

  return { db, deviceTable, oneTimePreKeyTable, signedPreKeyTable, transaction }
}

function createKeyMaterial(): LocalDeviceKeyMaterial {
  const signedPreKeyId = 'signed-pre-key-id'
  return {
    device: {
      deviceId: 'device-id',
      userId: 'user-id',
      activeSignedPreKeyId: signedPreKeyId,
      identityX25519: createKeyPair('X25519') as LocalDeviceKeyMaterial['device']['identityX25519'],
      identityX25519PublicKeyBytes: new Uint8Array(32),
      identityEd25519: createKeyPair('Ed25519') as LocalDeviceKeyMaterial['device']['identityEd25519'],
      identityEd25519PublicKeyBytes: new Uint8Array(32),
    },
    signedPreKey: {
      id: signedPreKeyId,
      keyPair: createKeyPair('X25519') as LocalDeviceKeyMaterial['signedPreKey']['keyPair'],
      publicKeyBytes: new Uint8Array(32),
      signature: new Uint8Array(64) as LocalDeviceKeyMaterial['signedPreKey']['signature'],
      createdAt: new Date('2026-08-25T10:00:00.000Z'),
      retiredAt: null,
    },
    oneTimePreKeys: [
      {
        id: 'one-time-pre-key-id',
        keyPair: createKeyPair('X25519') as LocalDeviceKeyMaterial['oneTimePreKeys'][number]['keyPair'],
        publicKeyBytes: new Uint8Array(32),
        createdAt: new Date('2026-08-25T10:00:00.000Z'),
      },
    ],
  }
}

function createKeyPair(algorithmName: string): { secretKey: CryptoKey; publicKey: CryptoKey } {
  return {
    secretKey: createCryptoKey('private', algorithmName),
    publicKey: createCryptoKey('public', algorithmName),
  }
}

function createCryptoKey(type: KeyType, algorithmName: string): CryptoKey {
  return {
    algorithm: { name: algorithmName },
    extractable: false,
    type,
    usages: [],
  } as CryptoKey
}
