export interface RegisterDeviceRequest {
  identityX25519PublicKey: string // Base64 encoded
  identityEd25519PublicKey: string // Base64 encoded
  signedPublicPreKey: string // Base64 encoded
  preKeySignature: string // Base64 encoded
  oneTimePublicPreKeys: string[] // Base64 encoded

  deviceName: string
}
