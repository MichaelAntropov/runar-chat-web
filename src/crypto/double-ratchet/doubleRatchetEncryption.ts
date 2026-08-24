import { concatBytes } from '@/crypto/encoding/binaryEncoding'

import { DoubleRatchetAuthenticationError } from './doubleRatchetErrors'
import type { DoubleRatchetCipherText, DoubleRatchetMessageKey } from './doubleRatchetTypes'

const KEY_LENGTH = 32
const PAYLOAD_KDF_INFO = new TextEncoder().encode('runar-chat/double-ratchet/encryption/v1')
const AES_KEY_LENGTH = 32
const AUTHENTICATION_KEY_LENGTH = 32
const AES_CBC_IV_LENGTH = 16
const AUTHENTICATION_TAG_LENGTH = 32
const PAYLOAD_KDF_OUTPUT_LENGTH = AES_KEY_LENGTH + AUTHENTICATION_KEY_LENGTH + AES_CBC_IV_LENGTH
const PAYLOAD_KDF_SALT = new Uint8Array(32)

interface DerivedPayloadKeys {
  readonly encryptionKey: CryptoKey
  readonly authenticationKey: CryptoKey
  readonly iv: Uint8Array<ArrayBuffer>
  destroy(): void
}

interface DoubleRatchetPayloadEncryptionInput {
  readonly messageKey: DoubleRatchetMessageKey
  readonly plaintext: Uint8Array<ArrayBuffer>
  readonly associatedData: Uint8Array<ArrayBuffer>
}

interface DoubleRatchetPayloadDecryptionInput {
  readonly messageKey: DoubleRatchetMessageKey
  readonly cipherText: DoubleRatchetCipherText
  readonly associatedData: Uint8Array<ArrayBuffer>
}

export async function encryptDoubleRatchetPayload(input: DoubleRatchetPayloadEncryptionInput): Promise<DoubleRatchetCipherText> {
  validateKeyLength(input.messageKey, 'Double Ratchet message key')
  validateBytes(input.plaintext, 'Double Ratchet plaintext')
  validateBytes(input.associatedData, 'Double Ratchet associated data')

  const payloadKeys: DerivedPayloadKeys = await derivePayloadKeys(input.messageKey, ['encrypt'])

  try {
    const encryptedPayload: Uint8Array<ArrayBuffer> = new Uint8Array(
      await globalThis.crypto.subtle.encrypt({ name: 'AES-CBC', iv: payloadKeys.iv }, payloadKeys.encryptionKey, input.plaintext)
    )
    const authenticationInput: Uint8Array<ArrayBuffer> = concatBytes([input.associatedData, encryptedPayload])
    let authenticationTag: Uint8Array<ArrayBuffer> | undefined

    try {
      authenticationTag = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', payloadKeys.authenticationKey, authenticationInput))

      return concatBytes([encryptedPayload, authenticationTag]) as DoubleRatchetCipherText
    } finally {
      authenticationInput.fill(0)
      authenticationTag?.fill(0)
    }
  } finally {
    payloadKeys.destroy()
  }
}

export async function decryptDoubleRatchetPayload(input: DoubleRatchetPayloadDecryptionInput): Promise<Uint8Array<ArrayBuffer>> {
  validateKeyLength(input.messageKey, 'Double Ratchet message key')
  validateBytes(input.cipherText, 'Double Ratchet cipher text')
  validateBytes(input.associatedData, 'Double Ratchet associated data')

  const encryptedPayloadLength = input.cipherText.byteLength - AUTHENTICATION_TAG_LENGTH
  if (encryptedPayloadLength < AES_CBC_IV_LENGTH || encryptedPayloadLength % AES_CBC_IV_LENGTH !== 0) {
    throw new DoubleRatchetAuthenticationError()
  }

  const encryptedPayload = input.cipherText.slice(0, encryptedPayloadLength)
  const authenticationTag = input.cipherText.slice(encryptedPayloadLength)
  const authenticationInput = concatBytes([input.associatedData, encryptedPayload])
  const payloadKeys = await derivePayloadKeys(input.messageKey, ['decrypt'])

  try {
    const isAuthentic = await globalThis.crypto.subtle.verify('HMAC', payloadKeys.authenticationKey, authenticationTag, authenticationInput)

    if (!isAuthentic) {
      throw new DoubleRatchetAuthenticationError()
    }

    try {
      return new Uint8Array(
        await globalThis.crypto.subtle.decrypt({ name: 'AES-CBC', iv: payloadKeys.iv }, payloadKeys.encryptionKey, encryptedPayload)
      )
    } catch {
      throw new DoubleRatchetAuthenticationError()
    }
  } finally {
    encryptedPayload.fill(0)
    authenticationTag.fill(0)
    authenticationInput.fill(0)
    payloadKeys.destroy()
  }
}

async function derivePayloadKeys(messageKey: DoubleRatchetMessageKey, encryptionKeyUsages: KeyUsage[]): Promise<DerivedPayloadKeys> {
  const hkdfKey = await globalThis.crypto.subtle.importKey('raw', messageKey, 'HKDF', false, ['deriveBits'])
  const derivedBytes: Uint8Array<ArrayBuffer> = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: PAYLOAD_KDF_SALT,
        info: PAYLOAD_KDF_INFO,
      },
      hkdfKey,
      PAYLOAD_KDF_OUTPUT_LENGTH * 8
    )
  )
  const encryptionKeyBytes: Uint8Array<ArrayBuffer> = derivedBytes.slice(0, AES_KEY_LENGTH)
  const authenticationKeyBytes: Uint8Array<ArrayBuffer> = derivedBytes.slice(AES_KEY_LENGTH, AES_KEY_LENGTH + AUTHENTICATION_KEY_LENGTH)
  const iv: Uint8Array<ArrayBuffer> = derivedBytes.slice(AES_KEY_LENGTH + AUTHENTICATION_KEY_LENGTH)

  try {
    const encryptionKey: CryptoKey = await globalThis.crypto.subtle.importKey('raw', encryptionKeyBytes, 'AES-CBC', false, encryptionKeyUsages)

    const authenticationKey: CryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      authenticationKeyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    )

    return {
      encryptionKey,
      authenticationKey,
      iv,
      destroy(): void {
        iv.fill(0)
      },
    } as DerivedPayloadKeys
  } finally {
    derivedBytes.fill(0)
    encryptionKeyBytes.fill(0)
    authenticationKeyBytes.fill(0)
  }
}

function validateKeyLength(key: Uint8Array<ArrayBuffer>, name: string): void {
  validateBytes(key, name)
  if (key.byteLength !== KEY_LENGTH) {
    throw new RangeError(`${name} must be ${KEY_LENGTH} bytes`)
  }
}

function validateBytes(value: Uint8Array<ArrayBuffer>, name: string): void {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${name} must be a Uint8Array`)
  }
}
