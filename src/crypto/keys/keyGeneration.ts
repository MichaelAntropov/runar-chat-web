import type {
  EphemeralX25519KeyPair,
  EphemeralX25519PublicKey,
  EphemeralX25519SecretKey,
  IdentityEd25519KeyPair,
  IdentityEd25519PublicKey,
  IdentityEd25519SecretKey,
  IdentityX25519KeyPair,
  IdentityX25519PublicKey,
  IdentityX25519SecretKey,
  SpkX25519PublicKey,
  SpkX25519SecretKey,
  SpkX25519KeyPair,
  OtpkX25519SecretKey,
  OtpkX25519PublicKey,
  OtpkX25519KeyPair,
} from "./keyTypes"

export async function generateIdentityEd25519KeyPair(): Promise<IdentityEd25519KeyPair> {
  try {
    const keyPair = (await globalThis.crypto.subtle.generateKey(
      { name: 'Ed25519' },
      false, // Do not allow export of private key
      ['sign', 'verify'],
    )) as CryptoKeyPair

    return {
      secretKey: keyPair.privateKey as IdentityEd25519SecretKey,
      publicKey: keyPair.publicKey as IdentityEd25519PublicKey,
    }
  } catch (error: unknown) {
    console.error('Error generating Ed25519 key pair:', error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate Ed25519 key: ${message}`)
  }
}

async function generateX25519KeyPair(): Promise<CryptoKeyPair> {
  try {
    const keyPair = (await globalThis.crypto.subtle.generateKey(
      { name: 'X25519' },
      false, // Do not allow export of private key
      ['deriveBits'],
    )) as CryptoKeyPair

    return keyPair
  } catch (error: unknown) {
    console.error('Error generating X25519 key pair:', error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate X25519 key: ${message}`)
  }
}

export async function generateIdentityX25519KeyPair(): Promise<IdentityX25519KeyPair> {
  const keyPair: CryptoKeyPair = await generateX25519KeyPair()
  return {
    secretKey: keyPair.privateKey as IdentityX25519SecretKey,
    publicKey: keyPair.publicKey as IdentityX25519PublicKey,
  }
}

export async function generateEphemeralX25519KeyPair(): Promise<EphemeralX25519KeyPair> {
  const keyPair: CryptoKeyPair = await generateX25519KeyPair()
  return {
    secretKey: keyPair.privateKey as EphemeralX25519SecretKey,
    publicKey: keyPair.publicKey as EphemeralX25519PublicKey,
  }
}

export async function generateSpkX25519KeyPair(): Promise<SpkX25519KeyPair> {
  const keyPair: CryptoKeyPair = await generateX25519KeyPair()
  return {
    secretKey: keyPair.privateKey as SpkX25519SecretKey,
    publicKey: keyPair.publicKey as SpkX25519PublicKey,
  }
}

export async function generateOtpkX25519KeyPairs(count: number): Promise<OtpkX25519KeyPair[]> {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('One-time pre-key count must be a non-negative integer')
  }

  const keyPairs: OtpkX25519KeyPair[] = []

  for (let i = 0; i < count; i++) {
    const keyPair: CryptoKeyPair = await generateX25519KeyPair()

    keyPairs.push({
      secretKey: keyPair.privateKey as OtpkX25519SecretKey,
      publicKey: keyPair.publicKey as OtpkX25519PublicKey,
    })
  }

  return keyPairs
}
