export interface RatchetEncryptResult {
  encryptedHeader: Uint8Array<ArrayBuffer>
  encryptedPayload: Uint8Array<ArrayBuffer>
}
