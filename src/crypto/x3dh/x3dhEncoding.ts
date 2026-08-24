import { concatBytes, encodeUint16, uuidToBytes } from "../encoding/binaryEncoding"
import type { CounterpartMaterialForX3DHPreKeySignature, MaterialForX3DHPreKeySignature } from "./x3dhTypes"

const PRE_KEY_SIGNATURE_DOMAIN = new TextEncoder().encode(
  'runar-chat/x3dh/pre-key-signature',
)
const PRE_KEY_SIGNATURE_VERSION: number = 1

export async function encodeMaterialForX3DHPreKeySignature(
  material: MaterialForX3DHPreKeySignature
): Promise<Uint8Array<ArrayBuffer>> {
  const [identityKeyBuffer, spkPublicKeyBuffer] = await Promise.all([
    globalThis.crypto.subtle.exportKey(
      'raw',
      material.identityX25519PublicKey,
    ),
    globalThis.crypto.subtle.exportKey(
      'raw',
      material.spkX25519PublicKey,
    ),
  ])

  const identityKeyBytes: Uint8Array<ArrayBuffer> = new Uint8Array(identityKeyBuffer)
  const spkPublicKeyBytes: Uint8Array<ArrayBuffer> = new Uint8Array(spkPublicKeyBuffer)

  if (identityKeyBytes.length !== 32) {
    throw new RangeError('X25519 identity public key must be 32 bytes')
  }

  if (spkPublicKeyBytes.length !== 32) {
    throw new RangeError('X25519 signed pre-key must be 32 bytes')
  }

  const userIdBytes: Uint8Array<ArrayBuffer> = uuidToBytes(material.userId)

  return concatBytes([
    encodeUint16(PRE_KEY_SIGNATURE_DOMAIN.length),
    PRE_KEY_SIGNATURE_DOMAIN,
    encodeUint16(PRE_KEY_SIGNATURE_VERSION),
    userIdBytes,
    identityKeyBytes,
    spkPublicKeyBytes,
  ])
}

export async function encodeCounterpartMaterialForX3DHPreKeySignatureCheck(
  material: CounterpartMaterialForX3DHPreKeySignature
): Promise<Uint8Array<ArrayBuffer>> {
  const [identityKeyBuffer, spkPublicKeyBuffer] = await Promise.all([
    globalThis.crypto.subtle.exportKey(
      'raw',
      material.identityX25519PublicKey,
    ),
    globalThis.crypto.subtle.exportKey(
      'raw',
      material.spkX25519PublicKey,
    ),
  ])

  const identityKeyBytes: Uint8Array<ArrayBuffer> = new Uint8Array(identityKeyBuffer)
  const spkPublicKeyBytes: Uint8Array<ArrayBuffer> = new Uint8Array(spkPublicKeyBuffer)

  if (identityKeyBytes.length !== 32) {
    throw new RangeError('X25519 identity public key must be 32 bytes')
  }

  if (spkPublicKeyBytes.length !== 32) {
    throw new RangeError('X25519 signed pre-key must be 32 bytes')
  }

  const userIdBytes: Uint8Array<ArrayBuffer> = uuidToBytes(material.userId)

  return concatBytes([
    encodeUint16(PRE_KEY_SIGNATURE_DOMAIN.length),
    PRE_KEY_SIGNATURE_DOMAIN,
    encodeUint16(PRE_KEY_SIGNATURE_VERSION),
    userIdBytes,
    identityKeyBytes,
    spkPublicKeyBytes,
  ])
}
