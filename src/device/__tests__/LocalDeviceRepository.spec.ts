import { describe, expect, it, vi } from 'vitest'

import type { RunarDb } from '@/db/RunarDB'
import { KEYS_STORE } from '@/db/RunarDB'

import { LocalDeviceRepository } from '../LocalDeviceRepository'
import type { LocalDevice } from '../types/LocalDevice'

describe('LocalDeviceRepository', () => {
  it('accepts a registered local device with no remaining one-time pre-keys', async () => {
    const device = createLocalDevice()
    const db = {
      [KEYS_STORE]: { get: vi.fn().mockResolvedValue(device) },
    } as unknown as RunarDb

    const result = await new LocalDeviceRepository(db).load(device.userId)

    expect(result).toEqual({ status: 'found', device })
  })

  it('does not mistake an obsolete key bundle for an unregistered device', async () => {
    const db = {
      [KEYS_STORE]: { get: vi.fn().mockResolvedValue({ deviceId: 'old-device' }) },
    } as unknown as RunarDb

    const result = await new LocalDeviceRepository(db).load('user-id')

    expect(result.status).toBe('invalid')
  })
})

function createLocalDevice(): LocalDevice {
  const x25519KeyPair = createKeyPair('X25519')
  const ed25519KeyPair = createKeyPair('Ed25519')
  const signedPreKeyPair = createKeyPair('X25519')

  return {
    deviceId: 'device-id',
    userId: 'user-id',
    identityX25519: x25519KeyPair as LocalDevice['identityX25519'],
    identityX25519PublicKeyBytes: new Uint8Array(32),
    identityEd25519: ed25519KeyPair as LocalDevice['identityEd25519'],
    identityEd25519PublicKeyBytes: new Uint8Array(32),
    signedPreKey: {
      id: 'signed-pre-key-id',
      keyPair: signedPreKeyPair as LocalDevice['signedPreKey']['keyPair'],
      publicKeyBytes: new Uint8Array(32),
      signature: new Uint8Array(64) as LocalDevice['signedPreKey']['signature'],
      createdAt: new Date('2026-08-25T10:00:00.000Z'),
    },
    oneTimePreKeys: [],
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
