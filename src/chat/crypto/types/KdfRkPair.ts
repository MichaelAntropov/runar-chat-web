export interface KdfRkPair {
  rootKey: Uint8Array<ArrayBuffer>
  chainKey: Uint8Array<ArrayBuffer>
  nextHeaderKey: Uint8Array<ArrayBuffer>
}
