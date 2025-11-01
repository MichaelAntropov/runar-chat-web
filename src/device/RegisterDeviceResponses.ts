export interface RegisterDeviceResponse {
  deviceId: string
  preKeyCreatedAt: Date
  oneTimePreKeys: OneTimePreKeyResponse[]
}

export interface OneTimePreKeyResponse {
  id: string
  createdAt: Date
}
