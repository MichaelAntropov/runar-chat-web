export interface OneTimePreKeyState {
  id: string | null
  createdAt: Date | null
  keyPair: CryptoKeyPair | null
  publicKey: Uint8Array | null
}
