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
