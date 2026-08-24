import type {
  IdentityX25519SecretKey,
  IdentityX25519PublicKey,
} from './keyTypes'

export function asX25519PrivateKey(key: CryptoKey): IdentityX25519SecretKey {
  if (
    key.algorithm.name !== 'X25519' ||
    key.type !== 'private' ||
    !key.usages.includes('deriveBits')
  ) {
    throw new TypeError('Expected an X25519 private key')
  }

  return key as IdentityX25519SecretKey
}

export function asX25519PublicKey(key: CryptoKey): IdentityX25519PublicKey {
  if (key.algorithm.name !== 'X25519' || key.type !== 'public') {
    throw new TypeError('Expected an X25519 public key')
  }

  return key as IdentityX25519PublicKey
}
