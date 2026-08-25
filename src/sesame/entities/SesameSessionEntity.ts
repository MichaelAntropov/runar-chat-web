import type { SesameSessionPhase } from '../types/sesameTypes'

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
