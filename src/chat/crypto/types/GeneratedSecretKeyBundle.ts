export interface GeneratedSecretKeyBundle {
  deviceId: string
  x25519publicIdentityKey: Uint8Array<ArrayBuffer>
  oneTimePreKeyId: string
  secretKey: CryptoKey
  sharedHeaderKey: Uint8Array<ArrayBuffer>
  sharedNextHeaderKey: Uint8Array<ArrayBuffer>
  preKeyPublic: Uint8Array<ArrayBuffer>
  ephemeralPublicBytes: Uint8Array<ArrayBuffer>
}
