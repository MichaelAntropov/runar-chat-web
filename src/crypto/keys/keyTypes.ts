import type { Brand } from '@/crypto/types/brand'

export type IdentityX25519SecretKey = Brand<CryptoKey, 'IdentityX25519SecretKey'>
export type IdentityX25519PublicKey = Brand<CryptoKey, 'IdentityX25519PublicKey'>

export interface IdentityX25519KeyPair {
  secretKey: IdentityX25519SecretKey
  publicKey: IdentityX25519PublicKey
}

export type IdentityEd25519SecretKey = Brand<CryptoKey, 'IdentityEd25519SecretKey'>
export type IdentityEd25519PublicKey = Brand<CryptoKey, 'IdentityEd25519PublicKey'>

export interface IdentityEd25519KeyPair {
  secretKey: IdentityEd25519SecretKey
  publicKey: IdentityEd25519PublicKey
}

export type SpkX25519SecretKey = Brand<CryptoKey, 'SpkX25519SecretKey'>
export type SpkX25519PublicKey = Brand<CryptoKey, 'SpkX25519PublicKey'>

export interface SpkX25519KeyPair {
  secretKey: SpkX25519SecretKey
  publicKey: SpkX25519PublicKey
}

export type OtpkX25519SecretKey = Brand<CryptoKey, 'OtpkX25519SecretKey'>
export type OtpkX25519PublicKey = Brand<CryptoKey, 'OtpkX25519PublicKey'>

export interface OtpkX25519KeyPair {
  secretKey: OtpkX25519SecretKey
  publicKey: OtpkX25519PublicKey
}

export type EphemeralX25519SecretKey = Brand<CryptoKey, 'EphemeralX25519SecretKey'>
export type EphemeralX25519PublicKey = Brand<CryptoKey, 'EphemeralX25519PublicKey'>

export interface EphemeralX25519KeyPair {
  secretKey: EphemeralX25519SecretKey
  publicKey: EphemeralX25519PublicKey
}

export type CounterpartIdentityX25519PublicKey = Brand<CryptoKey, 'CounterpartIdentityX25519PublicKey'>
export type CounterpartIdentityEd25519PublicKey = Brand<CryptoKey, 'CounterpartIdentityEd25519PublicKey'>
export type CounterpartSpkX25519PublicKey = Brand<CryptoKey, 'CounterpartSpkX25519PublicKey'>
export type CounterpartOtpkX25519PublicKey = Brand<CryptoKey, 'CounterpartOtpkX25519PublicKey'>
export type CounterpartEphemeralX25519PublicKey = Brand<CryptoKey, 'CounterpartEphemeralX25519PublicKey'>
