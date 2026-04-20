export interface MessagePayload {
  deviceMessages: DeviceMessagePayload[]
}

export interface DeviceMessagePayload {
  receiverUserId: string
  receiverDeviceId: string

  receiverPreKeyId: string | null
  receiverOneTimePreKeyId: string | null
  senderEphemeralKey: string | null

  cipherPayload: string
  encryptedHeader: string | null
}
