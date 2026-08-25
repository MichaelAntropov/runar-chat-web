export interface SesameDeviceIdentity {
  readonly x25519PublicKey: Uint8Array<ArrayBuffer>
  readonly ed25519PublicKey: Uint8Array<ArrayBuffer>
}

export interface SesameDeviceIdentityTuple extends SesameDeviceIdentity {
  readonly deviceId: string
}

export type SesameSessionPhase = 'initiating' | 'regular'

/**
 * Sesame owns session selection and lifecycle, while the encrypted-session
 * implementation owns the opaque state and initiation metadata.
 */
export interface SesameSessionRecord<SessionState, InitiationData = never> {
  readonly sessionId: string
  readonly phase: SesameSessionPhase
  readonly state: SessionState
  readonly initiationData: InitiationData | null
  readonly createdAt: number
  readonly lastUsedAt: number
}

export interface SesameDeviceRecord<SessionState, InitiationData = never> {
  readonly deviceId: string
  readonly identity: SesameDeviceIdentity
  readonly staleSince: number | null
  readonly activeSession: SesameSessionRecord<SessionState, InitiationData> | null
  readonly inactiveSessions: readonly SesameSessionRecord<SessionState, InitiationData>[]
}

export interface SesameUserRecord<SessionState, InitiationData = never> {
  readonly userId: string
  readonly staleSince: number | null
  readonly devices: readonly SesameDeviceRecord<SessionState, InitiationData>[]
}

export interface SesameLimits {
  readonly maxDevicesPerUser: number
  readonly maxSessionsPerDevice: number
}

export interface SesameLocalAddress {
  readonly userId: string
  readonly deviceId: string
}

export interface SesameDeviceSetReconciliationOptions {
  readonly localAddress: SesameLocalAddress
  readonly observedAt: number
  readonly limits: SesameLimits
}

export type SesameDeviceSetChangeType = 'added' | 'identity-changed' | 'reactivated' | 'marked-stale'

export interface SesameDeviceSetChange {
  readonly deviceId: string
  readonly type: SesameDeviceSetChangeType
}

export interface SesameDeviceSetReconciliationResult<SessionState, InitiationData = never> {
  readonly userRecord: SesameUserRecord<SessionState, InitiationData>
  readonly changes: readonly SesameDeviceSetChange[]
}

export interface SesameDeviceUpdateResult<SessionState, InitiationData = never> {
  readonly userRecord: SesameUserRecord<SessionState, InitiationData>
  readonly change: SesameDeviceSetChange | null
}

export interface SesameStaleRecordPruneOptions {
  readonly now: number
  readonly mailboxDrainedAt: number | null
  readonly maxLatencyMs: number
}
