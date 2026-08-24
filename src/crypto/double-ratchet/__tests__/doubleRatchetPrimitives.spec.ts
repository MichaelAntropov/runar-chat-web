import { describe, expect, it } from 'vitest'

import { deriveDoubleRatchetChainKeys } from '@/crypto/double-ratchet/doubleRatchet'
import {
  decryptDoubleRatchetPayload,
  encryptDoubleRatchetPayload,
} from '@/crypto/double-ratchet/doubleRatchetEncryption'
import {
  decodeDoubleRatchetHeader,
  encodeDoubleRatchetHeader,
} from '@/crypto/double-ratchet/doubleRatchetEncoding'
import { DoubleRatchetAuthenticationError } from '@/crypto/double-ratchet/doubleRatchetErrors'
import type {
  DoubleRatchetChainKey,
  DoubleRatchetCipherText,
  DoubleRatchetMessageKey,
  DoubleRatchetPublicKeyBytes,
} from '@/crypto/double-ratchet/doubleRatchetTypes'

function encodeText(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(value))
}

describe('Double Ratchet chain KDF', () => {
  it('derives distinct deterministic chain and message keys without mutating the input', async () => {
    const chainKey = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const originalChainKey = chainKey.slice()

    const first = await deriveDoubleRatchetChainKeys(chainKey as DoubleRatchetChainKey)
    const second = await deriveDoubleRatchetChainKeys(chainKey as DoubleRatchetChainKey)

    expect(first).toEqual(second)
    expect(first.chainKey).toHaveLength(32)
    expect(first.messageKey).toHaveLength(32)
    expect(first.chainKey).not.toEqual(first.messageKey)
    expect(chainKey).toEqual(originalChainKey)
  })
})

describe('Double Ratchet header encoding', () => {
  it('round-trips the ratchet public key and unsigned counters', () => {
    const header = {
      ratchetPublicKey: globalThis.crypto.getRandomValues(
        new Uint8Array(32),
      ) as DoubleRatchetPublicKeyBytes,
      previousChainLength: 0x01020304,
      messageNumber: 0xa0b0c0d0,
    }

    const encoded = encodeDoubleRatchetHeader(header)

    expect(encoded).toHaveLength(40)
    expect(decodeDoubleRatchetHeader(encoded)).toEqual(header)
  })

  it('rejects malformed headers and counters', () => {
    const publicKey = new Uint8Array(32) as DoubleRatchetPublicKeyBytes

    expect(() => decodeDoubleRatchetHeader(new Uint8Array(39))).toThrow(
      'Encoded Double Ratchet header must be 40 bytes',
    )
    expect(() =>
      encodeDoubleRatchetHeader({
        ratchetPublicKey: publicKey,
        previousChainLength: -1,
        messageNumber: 0,
      }),
    ).toThrow('Previous chain length must be an unsigned 32-bit integer')
  })
})

describe('Double Ratchet payload encryption', () => {
  it('round-trips plaintext while preserving caller-owned inputs', async () => {
    const messageKey = globalThis.crypto.getRandomValues(
      new Uint8Array(32),
    ) as DoubleRatchetMessageKey
    const plaintext = encodeText('Double Ratchet payload')
    const associatedData = globalThis.crypto.getRandomValues(new Uint8Array(57))
    const messageKeyBeforeEncryption = messageKey.slice()
    const plaintextBeforeEncryption = plaintext.slice()
    const associatedDataBeforeEncryption = associatedData.slice()

    const cipherText = await encryptDoubleRatchetPayload({
      messageKey,
      plaintext,
      associatedData,
    })
    const decrypted = await decryptDoubleRatchetPayload({
      messageKey,
      cipherText,
      associatedData,
    })

    expect(decrypted).toEqual(plaintext)
    expect(cipherText).not.toEqual(plaintext)
    expect(messageKey).toEqual(messageKeyBeforeEncryption)
    expect(plaintext).toEqual(plaintextBeforeEncryption)
    expect(associatedData).toEqual(associatedDataBeforeEncryption)
  })

  it('rejects modified associated data and cipher text', async () => {
    const messageKey = globalThis.crypto.getRandomValues(
      new Uint8Array(32),
    ) as DoubleRatchetMessageKey
    const associatedData = encodeText('associated data')
    const cipherText = await encryptDoubleRatchetPayload({
      messageKey,
      plaintext: encodeText('secret'),
      associatedData,
    })
    const modifiedCipherText = cipherText.slice() as DoubleRatchetCipherText
    modifiedCipherText[0] ^= 0x01

    await expect(
      decryptDoubleRatchetPayload({
        messageKey,
        cipherText,
        associatedData: encodeText('different associated data'),
      }),
    ).rejects.toBeInstanceOf(DoubleRatchetAuthenticationError)
    await expect(
      decryptDoubleRatchetPayload({
        messageKey,
        cipherText: modifiedCipherText,
        associatedData,
      }),
    ).rejects.toBeInstanceOf(DoubleRatchetAuthenticationError)
  })
})
