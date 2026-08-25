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

export interface SesameUserProjection<SessionState, InitiationData = never> {
  readonly entityVersion: number
  readonly userRecord: SesameUserRecord<SessionState, InitiationData>
}

export interface SesameCreatedInitiatingSession<SessionState, InitiationData> {
  readonly sessionId: string
  readonly state: SessionState
  readonly initiationData: InitiationData
}

export interface SesameCreatedReceivingSession<SessionState> {
  readonly sessionId: string
  readonly state: SessionState
}

export interface SesameSessionEncryptionResult<SessionState, EncryptedMessage> {
  readonly encryptedMessage: EncryptedMessage
  readonly nextSessionState: SessionState
}

export interface SesameSessionDecryptionResult<SessionState> {
  readonly plaintext: Uint8Array<ArrayBuffer>
  readonly nextSessionState: SessionState
}

export interface SesameRemoteDevice {
  readonly userId: string
  readonly deviceId: string
  readonly identity: SesameDeviceIdentity
}

/**
 * Functional adapter implemented by a direct-message session protocol such as
 * X3DH plus Double Ratchet. Implementations must not mutate supplied records.
 */
export interface SesameSessionAdapter<SessionState, InitiationData, EncryptedMessage> {
  createInitiatingSession(remoteDevice: SesameRemoteDevice): Promise<SesameCreatedInitiatingSession<SessionState, InitiationData>>

  createReceivingSession(remoteDevice: SesameRemoteDevice, encryptedMessage: EncryptedMessage): Promise<SesameCreatedReceivingSession<SessionState>>

  encrypt(
    remoteDevice: SesameRemoteDevice,
    session: SesameSessionRecord<SessionState, InitiationData>,
    plaintext: Uint8Array<ArrayBuffer>
  ): Promise<SesameSessionEncryptionResult<SessionState, EncryptedMessage>>

  tryDecrypt(
    remoteDevice: SesameRemoteDevice,
    session: SesameSessionRecord<SessionState, InitiationData>,
    encryptedMessage: EncryptedMessage
  ): Promise<SesameSessionDecryptionResult<SessionState> | null>

  isInitiationMessage(encryptedMessage: EncryptedMessage): boolean
}

export interface SesameEncryptedDeviceMessage<EncryptedMessage> {
  readonly deviceId: string
  readonly sessionId: string
  readonly encryptedMessage: EncryptedMessage
}

export interface SesameEncryptionResult<SessionState, InitiationData, EncryptedMessage> {
  readonly userRecord: SesameUserRecord<SessionState, InitiationData>
  readonly deviceMessages: readonly SesameEncryptedDeviceMessage<EncryptedMessage>[]
}

export interface SesameDecryptionInput<EncryptedMessage> {
  readonly senderUserId: string
  readonly senderDeviceId: string
  readonly senderIdentity: SesameDeviceIdentity | null
  readonly encryptedMessage: EncryptedMessage
  readonly processedAt: number
}

export interface SesameDecryptionResult<SessionState, InitiationData> {
  readonly userRecord: SesameUserRecord<SessionState, InitiationData>
  readonly plaintext: Uint8Array<ArrayBuffer>
  readonly sessionId: string
  readonly sessionCreated: boolean
  readonly deviceChange: SesameDeviceSetChange | null
}
