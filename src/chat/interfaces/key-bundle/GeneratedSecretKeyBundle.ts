export interface GeneratedSecretKeyBundle {
  deviceId: string
  x25519publicIdentityKey: Uint8Array<ArrayBuffer>
  oneTimePreKeyId: string
  secretKey: CryptoKey
  preKeyPublic: Uint8Array<ArrayBuffer>
  ephemeralPublicBytes: Uint8Array<ArrayBuffer>
}
