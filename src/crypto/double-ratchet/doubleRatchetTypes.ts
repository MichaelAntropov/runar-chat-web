import type { Brand } from '@/crypto/types/brand'

export type DoubleRatchetSecretKey = Brand<CryptoKey, 'DoubleRatchetSecretKey'>
export type DoubleRatchetPublicKeyBytes = Brand<Uint8Array<ArrayBuffer>, 'DoubleRatchetPublicKeyBytes'>

export interface DoubleRatchetKeyPair {
  readonly secretKey: DoubleRatchetSecretKey
  readonly publicKey: DoubleRatchetPublicKeyBytes
}

export type DoubleRatchetRootKey = Brand<Uint8Array<ArrayBuffer>, 'DoubleRatchetRootKey'>
export type DoubleRatchetChainKey = Brand<Uint8Array<ArrayBuffer>, 'DoubleRatchetChainKey'>
export type DoubleRatchetMessageKey = Brand<Uint8Array<ArrayBuffer>, 'DoubleRatchetMessageKey'>
export type EncodedDoubleRatchetHeader = Brand<Uint8Array<ArrayBuffer>, 'EncodedDoubleRatchetHeader'>
export type DoubleRatchetCipherText = Brand<Uint8Array<ArrayBuffer>, 'DoubleRatchetCipherText'>

export interface DoubleRatchetHeader {
  readonly ratchetPublicKey: DoubleRatchetPublicKeyBytes
  readonly previousChainLength: number
  readonly messageNumber: number
}

export interface SkippedDoubleRatchetMessageKey {
  readonly ratchetPublicKey: DoubleRatchetPublicKeyBytes
  readonly messageNumber: number
  readonly messageKey: DoubleRatchetMessageKey
}

interface DoubleRatchetStateBase {
  readonly localRatchetKeyPair: DoubleRatchetKeyPair
  readonly rootKey: DoubleRatchetRootKey
  readonly sendingMessageNumber: number
  readonly receivingMessageNumber: number
  readonly previousSendingChainLength: number
  readonly skippedMessageKeys: readonly SkippedDoubleRatchetMessageKey[]
}

export interface DoubleRatchetSendingInitialState extends DoubleRatchetStateBase {
  readonly remoteRatchetPublicKey: DoubleRatchetPublicKeyBytes
  readonly sendingChainKey: DoubleRatchetChainKey
  readonly receivingChainKey: null
}

export interface DoubleRatchetReceiverInitialState extends DoubleRatchetStateBase {
  readonly remoteRatchetPublicKey: null
  readonly sendingChainKey: null
  readonly receivingChainKey: null
}

export interface DoubleRatchetActiveState extends DoubleRatchetStateBase {
  readonly remoteRatchetPublicKey: DoubleRatchetPublicKeyBytes
  readonly sendingChainKey: DoubleRatchetChainKey
  readonly receivingChainKey: DoubleRatchetChainKey
}

export type DoubleRatchetState =
  | DoubleRatchetReceiverInitialState
  | DoubleRatchetSendingInitialState
  | DoubleRatchetActiveState

export interface DoubleRatchetInitiatorInitInput {
  readonly sharedSecret: Uint8Array<ArrayBuffer>
  readonly receiverInitialRatchetPublicKey: CryptoKey
}

export interface DoubleRatchetInitKeyPair {
  readonly secretKey: CryptoKey
  readonly publicKey: CryptoKey
}

export interface DoubleRatchetReceiverInitInput {
  readonly sharedSecret: Uint8Array<ArrayBuffer>
  readonly receiverInitialRatchetKeyPair: DoubleRatchetInitKeyPair
}

export interface RootKdfResult {
  readonly rootKey: DoubleRatchetRootKey
  readonly chainKey: DoubleRatchetChainKey
}

export interface ChainKdfResult {
  readonly chainKey: DoubleRatchetChainKey
  readonly messageKey: DoubleRatchetMessageKey
}

export interface DoubleRatchetPayloadEncryptionInput {
  readonly messageKey: DoubleRatchetMessageKey
  readonly plaintext: Uint8Array<ArrayBuffer>
  readonly associatedData: Uint8Array<ArrayBuffer>
}

export interface DoubleRatchetPayloadDecryptionInput {
  readonly messageKey: DoubleRatchetMessageKey
  readonly cipherText: DoubleRatchetCipherText
  readonly associatedData: Uint8Array<ArrayBuffer>
}
