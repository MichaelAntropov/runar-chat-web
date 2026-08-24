import type {
  IdentityEd25519KeyPair,
  IdentityX25519KeyPair,
  IdentityX25519PublicKey,
  OtpkX25519KeyPair,
  CounterpartSpkX25519PublicKey,
  SpkX25519KeyPair,
  SpkX25519PublicKey,
  IdentityX25519SecretKey,
  EphemeralX25519SecretKey,
  CounterpartIdentityX25519PublicKey,
  CounterpartOtpkX25519PublicKey,
  SpkX25519SecretKey,
  OtpkX25519SecretKey,
  CounterpartEphemeralX25519PublicKey
} from "../keys/keyTypes"
import type { SignedPreKeySignature } from "../keys/signTypes"
import type { Brand } from "../types/brand"

export interface MaterialForX3DHPreKeySignature {
  userId: string,
  identityX25519PublicKey: IdentityX25519PublicKey,
  spkX25519PublicKey: SpkX25519PublicKey,
}

export interface InitialDeviceKeyGenerationOptions {
  userId: string
  oneTimePreKeyCount: number
}

export interface SignedPreKeyMaterial {
  keyPair: SpkX25519KeyPair
  signature: SignedPreKeySignature
}

export interface InitialDeviceKeyMaterial {
  identityX25519: IdentityX25519KeyPair
  identityEd25519: IdentityEd25519KeyPair
  signedPreKey: SignedPreKeyMaterial
  oneTimePreKeys: OtpkX25519KeyPair[]
}

export interface CounterpartMaterialForX3DHPreKeySignature {
  userId: string
  identityX25519PublicKey: CounterpartIdentityX25519PublicKey
  spkX25519PublicKey: CounterpartSpkX25519PublicKey
}

export interface X3DHSharedSecretCalculationInitiatorInput {
  identityX25519SecretKey: IdentityX25519SecretKey,
  ephemeralX25519SecretKey: EphemeralX25519SecretKey,
  counterpartIdentityX25519PublicKey: CounterpartIdentityX25519PublicKey,
  counterpartSpkX25519PublicKey: CounterpartSpkX25519PublicKey,
  counterpartOtpkX25519PublicKey?: CounterpartOtpkX25519PublicKey,
}

export interface X3DHSharedSecretCalculationReceiverInput {
  identityX25519SecretKey: IdentityX25519SecretKey
  spkX25519SecretKey: SpkX25519SecretKey
  otpkX25519SecretKey?: OtpkX25519SecretKey
  counterpartIdentityX25519PublicKey: CounterpartIdentityX25519PublicKey
  counterpartEphemeralX25519PublicKey: CounterpartEphemeralX25519PublicKey
}

export type X3DHSharedSecret = Brand<Uint8Array<ArrayBuffer>, 'X3DHSharedSecret'>
