import { describe, expect, it } from 'vitest'

import type {
  CounterpartIdentityEd25519PublicKey,
  CounterpartIdentityX25519PublicKey,
  CounterpartSpkX25519PublicKey,
} from '@/crypto/keys/keyTypes'
import { verifyCounterpartEd25519Signature } from '@/crypto/keys/keySigning'
import { generateInitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dh'
import { encodeCounterpartMaterialForX3DHPreKeySignatureCheck } from '@/crypto/x3dh/x3dhEncoding'

import { asCounterpartKey } from './testKeys'

const USER_ID = '33333333-3333-4333-8333-333333333333'

describe('X3DH signed pre-key verification', () => {
  it('verifies the signature generated with the device key material', async () => {
    const material = await generateInitialDeviceKeyMaterial({
      userId: USER_ID,
      oneTimePreKeyCount: 2,
    })
    const encodedMaterial = await encodeCounterpartMaterialForX3DHPreKeySignatureCheck({
      userId: USER_ID,
      identityX25519PublicKey:
        asCounterpartKey<CounterpartIdentityX25519PublicKey>(material.identityX25519.publicKey),
      spkX25519PublicKey:
        asCounterpartKey<CounterpartSpkX25519PublicKey>(material.signedPreKey.keyPair.publicKey),
    })

    const valid = await verifyCounterpartEd25519Signature(
      asCounterpartKey<CounterpartIdentityEd25519PublicKey>(material.identityEd25519.publicKey),
      encodedMaterial,
      material.signedPreKey.signature,
    )

    expect(material.oneTimePreKeys).toHaveLength(2)
    expect(material.signedPreKey.signature).toHaveLength(64)
    expect(valid).toBe(true)
  })

  it('rejects the signature when the signed material is modified', async () => {
    const material = await generateInitialDeviceKeyMaterial({
      userId: USER_ID,
      oneTimePreKeyCount: 0,
    })
    const encodedMaterial = await encodeCounterpartMaterialForX3DHPreKeySignatureCheck({
      userId: USER_ID,
      identityX25519PublicKey:
        asCounterpartKey<CounterpartIdentityX25519PublicKey>(material.identityX25519.publicKey),
      spkX25519PublicKey:
        asCounterpartKey<CounterpartSpkX25519PublicKey>(material.signedPreKey.keyPair.publicKey),
    })
    encodedMaterial[encodedMaterial.length - 1] ^= 0x01

    const valid = await verifyCounterpartEd25519Signature(
      asCounterpartKey<CounterpartIdentityEd25519PublicKey>(material.identityEd25519.publicKey),
      encodedMaterial,
      material.signedPreKey.signature,
    )

    expect(valid).toBe(false)
  })

  it('rejects the signature when checked with another identity key', async () => {
    const [material, otherMaterial] = await Promise.all([
      generateInitialDeviceKeyMaterial({ userId: USER_ID, oneTimePreKeyCount: 0 }),
      generateInitialDeviceKeyMaterial({
        userId: '44444444-4444-4444-8444-444444444444',
        oneTimePreKeyCount: 0,
      }),
    ])
    const encodedMaterial = await encodeCounterpartMaterialForX3DHPreKeySignatureCheck({
      userId: USER_ID,
      identityX25519PublicKey:
        asCounterpartKey<CounterpartIdentityX25519PublicKey>(material.identityX25519.publicKey),
      spkX25519PublicKey:
        asCounterpartKey<CounterpartSpkX25519PublicKey>(material.signedPreKey.keyPair.publicKey),
    })

    const valid = await verifyCounterpartEd25519Signature(
      asCounterpartKey<CounterpartIdentityEd25519PublicKey>(
        otherMaterial.identityEd25519.publicKey,
      ),
      encodedMaterial,
      material.signedPreKey.signature,
    )

    expect(valid).toBe(false)
  })
})
