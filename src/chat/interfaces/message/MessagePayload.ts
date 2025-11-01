export interface MessagePayload {
  senderDeviceId: string
  deviceMessages: DeviceMessagePayload[]
}

export interface DeviceMessagePayload {
  receiverDeviceId: string

  receiverPreKeyId: string | null
  receiverOneTimePreKeyId: string | null
  senderEphemeralKey: string | null

  cipherPayload: string
  encryptedHeader: string | null
}
