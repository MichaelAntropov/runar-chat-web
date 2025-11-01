export interface KeyPairState {
  id: string | null
  keyPair: CryptoKeyPair | null
  publicKey: Uint8Array<ArrayBuffer> | null
}
