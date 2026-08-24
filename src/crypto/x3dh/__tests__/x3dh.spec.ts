import { describe, expect, it } from 'vitest'

import { generateEphemeralX25519KeyPair } from '@/crypto/keys/keyGeneration'
import type {
  CounterpartEphemeralX25519PublicKey,
  CounterpartIdentityX25519PublicKey,
  CounterpartOtpkX25519PublicKey,
  CounterpartSpkX25519PublicKey,
} from '@/crypto/keys/keyTypes'
import {
  calculateX3DHSharedSecretAsInitiator,
  calculateX3DHSharedSecretAsReceiver,
  generateInitialDeviceKeyMaterial,
} from '@/crypto/x3dh/x3dh'

import { asCounterpartKey } from './testKeys'

const ALICE_USER_ID = '11111111-1111-4111-8111-111111111111'
const BOB_USER_ID = '22222222-2222-4222-8222-222222222222'

describe('X3DH shared-secret calculation', () => {
  it('derives the same 32-byte secret for initiator and receiver when using an OTPK', async () => {
    const [alice, bob, ephemeralKeyPair] = await Promise.all([
      generateInitialDeviceKeyMaterial({ userId: ALICE_USER_ID, oneTimePreKeyCount: 0 }),
      generateInitialDeviceKeyMaterial({ userId: BOB_USER_ID, oneTimePreKeyCount: 1 }),
      generateEphemeralX25519KeyPair(),
    ])
    const bobOtpk = bob.oneTimePreKeys[0]

    expect(bobOtpk).toBeDefined()

    const initiatorSecret = await calculateX3DHSharedSecretAsInitiator({
      identityX25519SecretKey: alice.identityX25519.secretKey,
      ephemeralX25519SecretKey: ephemeralKeyPair.secretKey,
      counterpartIdentityX25519PublicKey:
        asCounterpartKey<CounterpartIdentityX25519PublicKey>(bob.identityX25519.publicKey),
      counterpartSpkX25519PublicKey:
        asCounterpartKey<CounterpartSpkX25519PublicKey>(bob.signedPreKey.keyPair.publicKey),
      counterpartOtpkX25519PublicKey:
        asCounterpartKey<CounterpartOtpkX25519PublicKey>(bobOtpk.publicKey),
    })
    const receiverSecret = await calculateX3DHSharedSecretAsReceiver({
      identityX25519SecretKey: bob.identityX25519.secretKey,
      spkX25519SecretKey: bob.signedPreKey.keyPair.secretKey,
      otpkX25519SecretKey: bobOtpk.secretKey,
      counterpartIdentityX25519PublicKey:
        asCounterpartKey<CounterpartIdentityX25519PublicKey>(alice.identityX25519.publicKey),
      counterpartEphemeralX25519PublicKey:
        asCounterpartKey<CounterpartEphemeralX25519PublicKey>(ephemeralKeyPair.publicKey),
    })

    expect(initiatorSecret).toHaveLength(32)
    expect(receiverSecret).toEqual(initiatorSecret)
  })

  it('derives the same 32-byte secret for the three-DH variant without an OTPK', async () => {
    const [alice, bob, ephemeralKeyPair] = await Promise.all([
      generateInitialDeviceKeyMaterial({ userId: ALICE_USER_ID, oneTimePreKeyCount: 0 }),
      generateInitialDeviceKeyMaterial({ userId: BOB_USER_ID, oneTimePreKeyCount: 0 }),
      generateEphemeralX25519KeyPair(),
    ])

    const initiatorSecret = await calculateX3DHSharedSecretAsInitiator({
      identityX25519SecretKey: alice.identityX25519.secretKey,
      ephemeralX25519SecretKey: ephemeralKeyPair.secretKey,
      counterpartIdentityX25519PublicKey:
        asCounterpartKey<CounterpartIdentityX25519PublicKey>(bob.identityX25519.publicKey),
      counterpartSpkX25519PublicKey:
        asCounterpartKey<CounterpartSpkX25519PublicKey>(bob.signedPreKey.keyPair.publicKey),
    })
    const receiverSecret = await calculateX3DHSharedSecretAsReceiver({
      identityX25519SecretKey: bob.identityX25519.secretKey,
      spkX25519SecretKey: bob.signedPreKey.keyPair.secretKey,
      counterpartIdentityX25519PublicKey:
        asCounterpartKey<CounterpartIdentityX25519PublicKey>(alice.identityX25519.publicKey),
      counterpartEphemeralX25519PublicKey:
        asCounterpartKey<CounterpartEphemeralX25519PublicKey>(ephemeralKeyPair.publicKey),
    })

    expect(initiatorSecret).toHaveLength(32)
    expect(receiverSecret).toEqual(initiatorSecret)
  })

  it('does not derive the same secret when only the initiator includes an OTPK', async () => {
    const [alice, bob, ephemeralKeyPair] = await Promise.all([
      generateInitialDeviceKeyMaterial({ userId: ALICE_USER_ID, oneTimePreKeyCount: 0 }),
      generateInitialDeviceKeyMaterial({ userId: BOB_USER_ID, oneTimePreKeyCount: 1 }),
      generateEphemeralX25519KeyPair(),
    ])
    const bobOtpk = bob.oneTimePreKeys[0]

    expect(bobOtpk).toBeDefined()

    const initiatorSecret = await calculateX3DHSharedSecretAsInitiator({
      identityX25519SecretKey: alice.identityX25519.secretKey,
      ephemeralX25519SecretKey: ephemeralKeyPair.secretKey,
      counterpartIdentityX25519PublicKey:
        asCounterpartKey<CounterpartIdentityX25519PublicKey>(bob.identityX25519.publicKey),
      counterpartSpkX25519PublicKey:
        asCounterpartKey<CounterpartSpkX25519PublicKey>(bob.signedPreKey.keyPair.publicKey),
      counterpartOtpkX25519PublicKey:
        asCounterpartKey<CounterpartOtpkX25519PublicKey>(bobOtpk.publicKey),
    })
    const receiverSecretWithoutOtpk = await calculateX3DHSharedSecretAsReceiver({
      identityX25519SecretKey: bob.identityX25519.secretKey,
      spkX25519SecretKey: bob.signedPreKey.keyPair.secretKey,
      counterpartIdentityX25519PublicKey:
        asCounterpartKey<CounterpartIdentityX25519PublicKey>(alice.identityX25519.publicKey),
      counterpartEphemeralX25519PublicKey:
        asCounterpartKey<CounterpartEphemeralX25519PublicKey>(ephemeralKeyPair.publicKey),
    })

    expect(receiverSecretWithoutOtpk).not.toEqual(initiatorSecret)
  })
})
