import type { SesameDeviceIdentity, SesameSessionRecord } from './sesameTypes'

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
