import { describe, expect, it } from 'vitest'

import { initializeDoubleRatchetAsInitiator, initializeDoubleRatchetAsReceiver } from '@/crypto/double-ratchet/doubleRatchet'
import { generateSpkX25519KeyPair } from '@/crypto/keys/keyGeneration'

describe('Double Ratchet initiator initialization', () => {
  it('creates the sending state defined by RatchetInitAlice', async () => {
    const receiverInitialRatchetKeyPair = await generateSpkX25519KeyPair()
    const sharedSecret = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const sharedSecretBeforeInitialization = sharedSecret.slice()

    const state = await initializeDoubleRatchetAsInitiator({
      sharedSecret,
      receiverInitialRatchetPublicKey: receiverInitialRatchetKeyPair.publicKey,
    })

    const expectedRemotePublicKey = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', receiverInitialRatchetKeyPair.publicKey))

    expect(state.localRatchetKeyPair.secretKey.type).toBe('private')
    expect(state.localRatchetKeyPair.secretKey.algorithm.name).toBe('X25519')
    expect(state.localRatchetKeyPair.secretKey.extractable).toBe(false)
    expect(state.localRatchetKeyPair.publicKey).toHaveLength(32)
    expect(state.remoteRatchetPublicKey).toEqual(expectedRemotePublicKey)
    expect(state.rootKey).toHaveLength(32)
    expect(state.sendingChainKey).toHaveLength(32)
    expect(state.receivingChainKey).toBeNull()
    expect(state.sendingMessageNumber).toBe(0)
    expect(state.receivingMessageNumber).toBe(0)
    expect(state.previousSendingChainLength).toBe(0)
    expect(sharedSecret).toEqual(sharedSecretBeforeInitialization)
  })

  it('rejects a shared secret that is not 32 bytes', async () => {
    const receiverInitialRatchetKeyPair = await generateSpkX25519KeyPair()

    await expect(
      initializeDoubleRatchetAsInitiator({
        sharedSecret: new Uint8Array(31),
        receiverInitialRatchetPublicKey: receiverInitialRatchetKeyPair.publicKey,
      })
    ).rejects.toThrow('Double Ratchet shared secret must be 32 bytes')
  })

  it('rejects a key that is not an X25519 public key', async () => {
    const invalidKey = await globalThis.crypto.subtle.importKey('raw', globalThis.crypto.getRandomValues(new Uint8Array(32)), 'AES-GCM', false, [
      'encrypt',
    ])

    await expect(
      initializeDoubleRatchetAsInitiator({
        sharedSecret: globalThis.crypto.getRandomValues(new Uint8Array(32)),
        receiverInitialRatchetPublicKey: invalidKey,
      })
    ).rejects.toThrow('Receiver initial ratchet key must be an X25519 public key')
  })
})

describe('Double Ratchet receiver initialization', () => {
  it('owns a defensive copy of the shared secret used as its root key', async () => {
    const receiverInitialRatchetKeyPair = await generateSpkX25519KeyPair()
    const sharedSecret = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const expectedRootKey = sharedSecret.slice()

    const state = await initializeDoubleRatchetAsReceiver({
      sharedSecret,
      receiverInitialRatchetKeyPair: receiverInitialRatchetKeyPair,
    })

    expect(state.rootKey).toEqual(expectedRootKey)
    expect(state.rootKey).not.toBe(sharedSecret)

    sharedSecret.fill(0)

    expect(state.rootKey).toEqual(expectedRootKey)
  })
})
