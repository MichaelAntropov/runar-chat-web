export interface IdentityKey {
  deviceId: string
  x25519PublicKey: Uint8Array<ArrayBuffer>
  ed25519PublicKey: Uint8Array<ArrayBuffer>
}
