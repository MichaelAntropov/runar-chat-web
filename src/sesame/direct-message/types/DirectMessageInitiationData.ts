export interface DirectMessageInitiationData {
  readonly receiverSignedPreKeyId: string
  readonly receiverOneTimePreKeyId: string | null
  readonly senderEphemeralKey: Uint8Array<ArrayBuffer>
}
