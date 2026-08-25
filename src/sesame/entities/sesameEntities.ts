import type { SesameDeviceIdentity, SesameSessionPhase } from '../types/sesameTypes'

export interface SesameUser {
  userId: string
  staleSince: number | null
  entityVersion: number
}

export interface SesameDevice {
  userId: string
  deviceId: string
  identity: SesameDeviceIdentity
  staleSince: number | null
  activeSessionId: string | null
}

export interface SesameSession<SessionState = unknown, InitiationData = unknown> {
  sessionId: string
  userId: string
  deviceId: string
  phase: SesameSessionPhase
  state: SessionState
  initiationData: InitiationData | null
  createdAt: number
  lastUsedAt: number
  inactiveOrder: number | null
}
