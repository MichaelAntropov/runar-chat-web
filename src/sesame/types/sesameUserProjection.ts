import type { SesameUserRecord } from './sesameTypes'

export interface SesameUserProjection<SessionState, InitiationData = never> {
  entityVersion: number
  userRecord: SesameUserRecord<SessionState, InitiationData>
}
