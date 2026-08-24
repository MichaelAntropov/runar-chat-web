import { concatBytes } from "../encoding/binaryEncoding"
import { generateIdentityEd25519KeyPair, generateIdentityX25519KeyPair, generateOtpkX25519KeyPairs, generateSpkX25519KeyPair } from "../keys/keyGeneration"
import { signWithIdentitySecretEd25519 } from "../keys/keySigning"
import type { SignedPreKeySignature } from "../keys/signTypes"
import { encodeMaterialForX3DHPreKeySignature } from "./x3dhEncoding"
import type { InitialDeviceKeyGenerationOptions, InitialDeviceKeyMaterial, MaterialForX3DHPreKeySignature, X3DHSharedSecret, X3DHSharedSecretCalculationInitiatorInput, X3DHSharedSecretCalculationReceiverInput } from "./x3dhTypes"

const X3DH_INFO = new TextEncoder().encode('runar-chat/x3dh/v1')
const X25519_DOMAIN_PREFIX = new Uint8Array(32).fill(0xff)
const HKDF_SALT = new Uint8Array(32)

/**
 * Generates the initial device key material for a new user/device.
 * This includes identity keys, a signed pre key, and a specified number of one-time pre keys.
 * @param options - The options for generating the initial device key material, including user ID and one-time pre-key count.
 * @returns A promise that resolves to the generated initial device key material.
 */
export async function generateInitialDeviceKeyMaterial(options: InitialDeviceKeyGenerationOptions): Promise<InitialDeviceKeyMaterial> {
  const [
    identityX25519,
    identityEd25519,
    signedPreKeyPair,
    oneTimePreKeys,
  ] = await Promise.all([
    generateIdentityX25519KeyPair(),
    generateIdentityEd25519KeyPair(),
    generateSpkX25519KeyPair(),
    generateOtpkX25519KeyPairs(options.oneTimePreKeyCount),
  ])

  const materialToSign: MaterialForX3DHPreKeySignature = {
    userId: options.userId,
    identityX25519PublicKey: identityX25519.publicKey,
    spkX25519PublicKey: signedPreKeyPair.publicKey,
  }

  const signature = await signWithIdentitySecretEd25519(
    identityEd25519.secretKey,
    await encodeMaterialForX3DHPreKeySignature(materialToSign),
  ) as SignedPreKeySignature

  return {
    identityX25519,
    identityEd25519,
    signedPreKey: {
      keyPair: signedPreKeyPair,
      signature,
    },
    oneTimePreKeys,
  }
}

export async function calculateDH(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  const resultBuffer = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'X25519',
      public: publicKey,
    },
    privateKey,
    256,
  )

  return new Uint8Array(resultBuffer)
}

export async function calculateX3DHSharedSecretAsInitiator(input: X3DHSharedSecretCalculationInitiatorInput): Promise<X3DHSharedSecret> {
  let dh1: Uint8Array<ArrayBuffer> | undefined
  let dh2: Uint8Array<ArrayBuffer> | undefined
  let dh3: Uint8Array<ArrayBuffer> | undefined
  let dh4: Uint8Array<ArrayBuffer> | undefined
  let keyMaterial: Uint8Array<ArrayBuffer> | undefined

  try {
    dh1 = await calculateDH(input.identityX25519SecretKey, input.counterpartSpkX25519PublicKey)
    dh2 = await calculateDH(input.ephemeralX25519SecretKey, input.counterpartIdentityX25519PublicKey)
    dh3 = await calculateDH(input.ephemeralX25519SecretKey, input.counterpartSpkX25519PublicKey)
    dh4 = input.counterpartOtpkX25519PublicKey
      ? await calculateDH(input.ephemeralX25519SecretKey, input.counterpartOtpkX25519PublicKey)
      : undefined

    keyMaterial = concatBytes([
      X25519_DOMAIN_PREFIX,
      dh1,
      dh2,
      dh3,
      ...(dh4 ? [dh4] : []),
    ])

    return await deriveX3DHSharedSecret(keyMaterial)
  } finally {
    fillWithZeros(dh1, dh2, dh3, dh4, keyMaterial)
  }
}

export async function calculateX3DHSharedSecretAsReceiver(input: X3DHSharedSecretCalculationReceiverInput): Promise<X3DHSharedSecret> {
  let dh1: Uint8Array<ArrayBuffer> | undefined
  let dh2: Uint8Array<ArrayBuffer> | undefined
  let dh3: Uint8Array<ArrayBuffer> | undefined
  let dh4: Uint8Array<ArrayBuffer> | undefined
  let keyMaterial: Uint8Array<ArrayBuffer> | undefined

  try {
    dh1 = await calculateDH(input.spkX25519SecretKey, input.counterpartIdentityX25519PublicKey)
    dh2 = await calculateDH(input.identityX25519SecretKey, input.counterpartEphemeralX25519PublicKey)
    dh3 = await calculateDH(input.spkX25519SecretKey, input.counterpartEphemeralX25519PublicKey)
    dh4 = input.otpkX25519SecretKey
      ? await calculateDH(input.otpkX25519SecretKey, input.counterpartEphemeralX25519PublicKey)
      : undefined

    keyMaterial = concatBytes([
      X25519_DOMAIN_PREFIX,
      dh1,
      dh2,
      dh3,
      ...(dh4 ? [dh4] : []),
    ])

    return await deriveX3DHSharedSecret(keyMaterial)
  } finally {
    fillWithZeros(dh1, dh2, dh3, dh4, keyMaterial)
  }
}

async function deriveX3DHSharedSecret(keyMaterial: Uint8Array<ArrayBuffer>): Promise<X3DHSharedSecret> {
  const hkdfKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyMaterial,
    'HKDF',
    false,
    ['deriveBits'],
  )

  return new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: HKDF_SALT,
        info: X3DH_INFO,
      },
      hkdfKey,
      256,
    ),
  ) as X3DHSharedSecret
}

function fillWithZeros(...values: Array<Uint8Array<ArrayBuffer> | undefined>): void {
  for (const value of values) {
    value?.fill(0)
  }
}
