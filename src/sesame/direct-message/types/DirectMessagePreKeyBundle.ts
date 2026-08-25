export interface DirectMessagePreKeyBundle {
  readonly userId: string
  readonly deviceId: string
  readonly identityX25519PublicKey: Uint8Array<ArrayBuffer>
  readonly identityEd25519PublicKey: Uint8Array<ArrayBuffer>
  readonly signedPreKeyId: string
  readonly signedPreKeyPublicKey: Uint8Array<ArrayBuffer>
  readonly signedPreKeySignature: Uint8Array<ArrayBuffer>
  readonly oneTimePreKeyId: string | null
  readonly oneTimePreKeyPublicKey: Uint8Array<ArrayBuffer> | null
}
