import type { KeyPairState } from '@/device/interfaces/KeyPairState '
import type { GeneratedSecretKeyBundle } from '../interfaces/key-bundle/GeneratedSecretKeyBundle'
import type { InitDeviceKeyBundle } from '../interfaces/key-bundle/InitKeyBundleResponse'
import type { OneTimePreKeyState } from '@/device/interfaces/OneTimePreKeyState'
import type { IdentityKey } from '../interfaces/identity-key/IdentityKey'

const APPLICATION_INFO_STRING = 'QuarkusChatSecure'

export async function calculateDH(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  const resultBuffer = await window.crypto.subtle.deriveBits(
    {
      name: 'X25519',
      public: publicKey,
    },
    privateKey,
    256,
  )

  return new Uint8Array(resultBuffer)
}

export async function x25519PublicCryptoKeyForDHFromPublicBytes(
  publicKeyBytes: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  if (!(publicKeyBytes instanceof Uint8Array)) {
    throw new TypeError('publicKeyBytes must be a Uint8Array.')
  }

  if (publicKeyBytes.byteLength !== 32) {
    console.warn(
      `Warning: X25519 public key should be 32 bytes. Provided length: ${publicKeyBytes.byteLength}.`,
    )
  }

  try {
    const publicKey = await window.crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'X25519' },
      true,
      [],
    )
    return publicKey
  } catch (error) {
    console.error('Error importing X25519 public key:', error)
    throw error
  }
}

export async function verifyPreKeySignature(
  ed25519PublicKeyRaw: Uint8Array<ArrayBuffer>,
  preKey: Uint8Array<ArrayBuffer>,
  preKeySignature: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  if (
    !ed25519PublicKeyRaw ||
    ed25519PublicKeyRaw.length !== 32 ||
    !preKey ||
    preKey.length !== 32 ||
    !preKeySignature ||
    preKeySignature.length !== 64
  ) {
    console.warn(
      'Invalid input parameters for signature verification: Check lengths (PublicKey: 32, PreKey: 32, Signature: 64) and ensure values are not null/undefined.',
    )
    return false
  }

  if (!window.crypto || !window.crypto.subtle) {
    console.error(
      'Web Cryptography API (window.crypto.subtle) is not available in this browser environment.',
    )
    return false
  }

  try {
    const publicKey: CryptoKey = await window.crypto.subtle.importKey(
      'raw',
      ed25519PublicKeyRaw,
      { name: 'Ed25519' },
      false,
      ['verify'],
    )

    const isValid: boolean = await window.crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      preKeySignature,
      preKey,
    )

    return isValid
  } catch (error) {
    console.error(
      `Signature verification failed during Web Crypto operation: ${error instanceof Error ? error.message : String(error)}`,
      error,
    )
    return false
  }
}

/**
 * Generates the initial shared secret key (SK) for a recipient's device bundle.
 * This is part of the X3DH key agreement protocol, executed by the sender.
 * @param keyBundle The key bundle of the recipient's device.
 * @param ikSenderPrivate The sender's private X25519 identity key.
 * @returns A bundle containing the generated secret key and related data.
 */
export async function generateSecretKeyForKeyBundle(
  keyBundle: InitDeviceKeyBundle,
  ikSenderPrivate: CryptoKey,
): Promise<GeneratedSecretKeyBundle> {
  console.log(`Generate SK for device=${keyBundle.deviceId}`)

  const senderEphemeralKey: CryptoKeyPair = (await crypto.subtle.generateKey(
    { name: 'X25519' },
    false,
    ['deriveBits'],
  )) as CryptoKeyPair

  const ikReceiverPublic: CryptoKey = await x25519PublicCryptoKeyForDHFromPublicBytes(
    keyBundle.x25519identityKey,
  )

  const preKeyPublic: CryptoKey = await x25519PublicCryptoKeyForDHFromPublicBytes(keyBundle.preKey)

  let oneTimePreKey: CryptoKey | null = null
  if (keyBundle.oneTimePreKey) {
    oneTimePreKey = await x25519PublicCryptoKeyForDHFromPublicBytes(keyBundle.oneTimePreKey)
  }

  const dh1: Uint8Array = await calculateDH(ikSenderPrivate, preKeyPublic)
  const dh2: Uint8Array = await calculateDH(senderEphemeralKey.privateKey, ikReceiverPublic)
  const dh3: Uint8Array = await calculateDH(senderEphemeralKey.privateKey, preKeyPublic)
  let dh4: Uint8Array | null = null
  if (oneTimePreKey) {
    dh4 = await calculateDH(senderEphemeralKey.privateKey, oneTimePreKey)
  }

  const keyMaterialSegments = [dh1, dh2, dh3]
  if (dh4) {
    keyMaterialSegments.push(dh4)
  } else {
    console.warn(`One time pre key missing for device=${keyBundle.deviceId}!`)
  }
  const keyMaterial = new Uint8Array(
    keyMaterialSegments.reduce((totalLength, arr) => totalLength + arr.length, 0),
  )
  let offset = 0
  for (const segment of keyMaterialSegments) {
    keyMaterial.set(segment, offset)
    offset += segment.length
  }

  const baseKey: CryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  )

  const secretKey = await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: new Uint8Array(32).fill(0),
      info: new TextEncoder().encode(APPLICATION_INFO_STRING),
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )

  const senderEphemeralKeyPublic = await window.crypto.subtle.exportKey(
    'raw',
    senderEphemeralKey.publicKey,
  )

  console.log(`SK for device=${keyBundle.deviceId} generated!`)
  return {
    deviceId: keyBundle.deviceId,
    x25519publicIdentityKey: keyBundle.x25519identityKey,
    oneTimePreKeyId: keyBundle.oneTimePreKeyId,
    secretKey: secretKey,
    preKeyPublic: keyBundle.preKey,
    ephemeralPublicBytes: new Uint8Array(senderEphemeralKeyPublic),
  }
}

/**
 * Establishes a ChatState for a given sender device when receiving an initial message.
 * This is part of the X3DH key agreement protocol, executed by the receiver.
 * @param senderUserId The ID of the user who sent the message.
 * @param senderDeviceId The ID of the device that sent the message.
 * @param senderEphemeralKey The sender's public ephemeral key.
 * @param preKeyIdUsed The ID of the one-time pre-key used by the sender, if any.
 */
export async function establishSecretKeyWithSender(
  senderIdentityKey: IdentityKey,
  senderEphemeralKey: Uint8Array<ArrayBuffer>,
  receiverIdentity: KeyPairState,
  receiverSignedPreKey: KeyPairState,
  oneTimePreKey: OneTimePreKeyState,
): Promise<CryptoKey> {
  const identityKeyPrivate = receiverIdentity.keyPair?.privateKey
  const preKeyPrivate = receiverSignedPreKey.keyPair?.privateKey

  if (!identityKeyPrivate || !preKeyPrivate || !senderIdentityKey.x25519PublicKey) {
    throw new Error('Local identity/pre key missing or sender public key unavailable!')
  }

  const identityKeySenderPublic: CryptoKey = await x25519PublicCryptoKeyForDHFromPublicBytes(
    senderIdentityKey.x25519PublicKey,
  )
  const ephemeralSenderPublic: CryptoKey =
    await x25519PublicCryptoKeyForDHFromPublicBytes(senderEphemeralKey)

  const dh1: Uint8Array = await calculateDH(preKeyPrivate, identityKeySenderPublic)
  const dh2: Uint8Array = await calculateDH(identityKeyPrivate, ephemeralSenderPublic)
  const dh3: Uint8Array = await calculateDH(preKeyPrivate, ephemeralSenderPublic)
  let dh4: Uint8Array | null = null
  if (oneTimePreKey?.keyPair?.privateKey) {
    dh4 = await calculateDH(oneTimePreKey.keyPair.privateKey, ephemeralSenderPublic)
  }

  const keyMaterialSegments = [dh1, dh2, dh3]
  if (dh4) {
    keyMaterialSegments.push(dh4)
  } else {
    console.warn(
      `One time pre key was not used or found for incoming message with deviceId=${senderIdentityKey.deviceId}!`,
    )
  }
  const keyMaterial = new Uint8Array(keyMaterialSegments.reduce((sum, arr) => sum + arr.length, 0))
  let offset = 0
  for (const segment of keyMaterialSegments) {
    keyMaterial.set(segment, offset)
    offset += segment.length
  }

  const baseKey: CryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  )

  const secretKey: CryptoKey = await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: new Uint8Array(32).fill(0),
      info: new TextEncoder().encode(APPLICATION_INFO_STRING),
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )

  return secretKey
}
