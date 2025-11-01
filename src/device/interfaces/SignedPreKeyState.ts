export interface SignedPreKeyState {
  id: string | null
  keyPair: CryptoKeyPair | null
  publicKey: Uint8Array<ArrayBuffer> | null
  signature: Uint8Array<ArrayBuffer> | null
}
