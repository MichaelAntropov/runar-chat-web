import type { IdentityEd25519SecretKey, CounterpartIdentityEd25519PublicKey } from "./keyTypes"


export async function signWithIdentitySecretEd25519(
  secretKey: IdentityEd25519SecretKey,
  data: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  if (!secretKey || secretKey.type !== 'private' || secretKey.algorithm.name !== 'Ed25519') {
    throw new Error('Invalid secret key provided for signing (must be Ed25519 private CryptoKey).')
  }

  try {
    const signature = await globalThis.crypto.subtle.sign(
      { name: 'Ed25519' },
      secretKey,
      data,
    )
    return new Uint8Array<ArrayBuffer>(signature)
  } catch (error) {
    console.error('Error signing data with Ed25519 key:', error)
    throw error
  }
}

export async function verifyCounterpartEd25519Signature(
  publicKey: CounterpartIdentityEd25519PublicKey,
  data: Uint8Array<ArrayBuffer>,
  signature: Uint8Array<ArrayBuffer>
): Promise<boolean> {
  try {
    const isValid = await globalThis.crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      signature,
      data,
    )
    return isValid
  } catch (error) {
    console.error('Error verifying Ed25519 signature:', error)
    throw error
  }
}
