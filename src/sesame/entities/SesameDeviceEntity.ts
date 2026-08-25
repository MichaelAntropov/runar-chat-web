import type { SesameDeviceIdentity } from '../types/sesameTypes'

export interface SesameDevice {
  userId: string
  deviceId: string
  identity: SesameDeviceIdentity
  staleSince: number | null
  activeSessionId: string | null
}
