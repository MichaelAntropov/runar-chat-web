export interface RegisterDeviceResponse {
  deviceId: string
  signedPreKeyId: string
  signedPreKeyCreatedAt: string
  oneTimePreKeys: OneTimePreKeyResponse[]
}

export interface OneTimePreKeyResponse {
  id: string
  createdAt: string
}
