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
export type DoubleRatchetSkippedMessageKeyId = Brand<string, 'DoubleRatchetSkippedMessageKeyId'>

export interface DoubleRatchetHeader {
  readonly ratchetPublicKey: DoubleRatchetPublicKeyBytes
  readonly previousChainLength: number
  readonly messageNumber: number
}

export interface SkippedDoubleRatchetMessageKey {
  readonly id: DoubleRatchetSkippedMessageKeyId
  readonly ratchetPublicKey: DoubleRatchetPublicKeyBytes
  readonly messageNumber: number
  readonly messageKey: DoubleRatchetMessageKey
}

export type DoubleRatchetSkippedMessageKeys = ReadonlyMap<DoubleRatchetSkippedMessageKeyId, SkippedDoubleRatchetMessageKey>

export interface DoubleRatchetSendingInitialState {
  readonly localRatchetKeyPair: DoubleRatchetKeyPair
  readonly remoteRatchetPublicKey: DoubleRatchetPublicKeyBytes
  readonly rootKey: DoubleRatchetRootKey
  readonly sendingChainKey: DoubleRatchetChainKey
  readonly receivingChainKey: null
  readonly sendingMessageNumber: number
  readonly receivingMessageNumber: number
  readonly previousSendingChainLength: number
}

export interface DoubleRatchetReceiverInitialState {
  readonly localRatchetKeyPair: DoubleRatchetKeyPair
  readonly remoteRatchetPublicKey: null
  readonly rootKey: DoubleRatchetRootKey
  readonly sendingChainKey: null
  readonly receivingChainKey: null
  readonly sendingMessageNumber: number
  readonly receivingMessageNumber: number
  readonly previousSendingChainLength: number
}

export interface DoubleRatchetActiveState {
  readonly localRatchetKeyPair: DoubleRatchetKeyPair
  readonly remoteRatchetPublicKey: DoubleRatchetPublicKeyBytes
  readonly rootKey: DoubleRatchetRootKey
  readonly sendingChainKey: DoubleRatchetChainKey
  readonly receivingChainKey: DoubleRatchetChainKey
  readonly sendingMessageNumber: number
  readonly receivingMessageNumber: number
  readonly previousSendingChainLength: number
}

export type DoubleRatchetState = DoubleRatchetReceiverInitialState | DoubleRatchetSendingInitialState | DoubleRatchetActiveState

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

export interface DoubleRatchetEncryptInput {
  readonly state: DoubleRatchetSendingInitialState | DoubleRatchetActiveState
  readonly plaintext: Uint8Array<ArrayBuffer>
  readonly associatedData: Uint8Array<ArrayBuffer>
}

export interface DoubleRatchetEncryptedMessage {
  readonly encodedHeader: EncodedDoubleRatchetHeader
  readonly cipherText: DoubleRatchetCipherText
}

export interface DoubleRatchetEncryptResult {
  readonly encryptedMessage: DoubleRatchetEncryptedMessage
  readonly nextState: DoubleRatchetSendingInitialState | DoubleRatchetActiveState
}

export interface DoubleRatchetDecryptInput {
  readonly state: DoubleRatchetState
  readonly encryptedMessage: DoubleRatchetEncryptedMessage
  readonly associatedData: Uint8Array<ArrayBuffer>
  readonly skippedMessageKeys: DoubleRatchetSkippedMessageKeys
}

export interface DoubleRatchetSkippedMessageKeyChanges {
  readonly added: readonly SkippedDoubleRatchetMessageKey[]
  readonly consumed: DoubleRatchetSkippedMessageKeyId | null
}

export interface DoubleRatchetStateChange {
  readonly nextCoreState: DoubleRatchetState
  readonly skippedMessageKeys: DoubleRatchetSkippedMessageKeyChanges
}

export interface DoubleRatchetDecryptResult {
  readonly plaintext: Uint8Array<ArrayBuffer>
  readonly stateChange: DoubleRatchetStateChange
}
