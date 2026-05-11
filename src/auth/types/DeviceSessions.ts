export interface DeviceSessions {
  deviceSessions: DeviceSession[]
}

export interface DeviceSession {
  deviceId: string
  deviceName: string | null
  registeredAt: string
  lastActiveAt: string | null
}
