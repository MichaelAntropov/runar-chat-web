export interface RatchetEncryptResult {
  header: Uint8Array<ArrayBuffer>
  encryptedPayload: Uint8Array<ArrayBuffer>
}
