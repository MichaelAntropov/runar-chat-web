export interface InitialRatchetKeys {
  rootKey: CryptoKey
  sharedHeaderKey: Uint8Array<ArrayBuffer>
  sharedNextHeaderKey: Uint8Array<ArrayBuffer>
}
