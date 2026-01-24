export interface DbEncryptionState {
  isEncrypted: boolean
  encryptedDek: Uint8Array<ArrayBuffer> | null
  dekSalt: Uint8Array<ArrayBuffer> | null
  iv: Uint8Array<ArrayBuffer> | null
}
