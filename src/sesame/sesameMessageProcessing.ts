import {
  commitSesameDecryption,
  commitSesameEncryption,
  conditionallyUpdateSesameDevice,
  insertSesameSession,
  listSesameDecryptionCandidates,
} from './sesameState'
import { SesameInvalidStateError } from './types/sesameErrors'
import type {
  SesameDecryptionInput,
  SesameDecryptionResult,
  SesameDeviceIdentityTuple,
  SesameDeviceRecord,
  SesameDeviceSetReconciliationOptions,
  SesameEncryptionResult,
  SesameRemoteDevice,
  SesameSessionAdapter,
  SesameSessionDecryptionResult,
  SesameSessionRecord,
  SesameUserRecord,
} from './types/sesameTypes'

export async function ensureActiveSesameSessions<SessionState, InitiationData, EncryptedMessage>(
  userRecord: SesameUserRecord<SessionState, InitiationData>,
  adapter: SesameSessionAdapter<SessionState, InitiationData, EncryptedMessage>,
  createdAt: number,
  maxSessionsPerDevice: number
): Promise<SesameUserRecord<SessionState, InitiationData>> {
  if (userRecord.staleSince !== null) {
    throw new SesameInvalidStateError('Cannot prepare sessions for a stale Sesame user record')
  }

  const devices = await Promise.all(
    userRecord.devices.map(async (deviceRecord) => {
      if (deviceRecord.staleSince !== null || deviceRecord.activeSession !== null) {
        return deviceRecord
      }

      const createdSession = await adapter.createInitiatingSession(toRemoteDevice(userRecord.userId, deviceRecord))
      const session: SesameSessionRecord<SessionState, InitiationData> = {
        sessionId: createdSession.sessionId,
        phase: 'initiating',
        state: createdSession.state,
        initiationData: createdSession.initiationData,
        createdAt,
        lastUsedAt: createdAt,
      }

      return insertSesameSession(deviceRecord, session, maxSessionsPerDevice)
    })
  )

  return { ...userRecord, devices }
}

export async function encryptSesameMessageForUser<SessionState, InitiationData, EncryptedMessage>(
  userRecord: SesameUserRecord<SessionState, InitiationData>,
  plaintext: Uint8Array<ArrayBuffer>,
  adapter: SesameSessionAdapter<SessionState, InitiationData, EncryptedMessage>,
  encryptedAt: number
): Promise<SesameEncryptionResult<SessionState, InitiationData, EncryptedMessage>> {
  if (userRecord.staleSince !== null) {
    throw new SesameInvalidStateError('Cannot encrypt using a stale Sesame user record')
  }

  const activeDevices = userRecord.devices.filter((deviceRecord) => deviceRecord.staleSince === null && deviceRecord.activeSession !== null)
  const encryptedDevices = await Promise.all(
    activeDevices.map(async (deviceRecord) => {
      const activeSession = deviceRecord.activeSession!
      const encrypted = await adapter.encrypt(toRemoteDevice(userRecord.userId, deviceRecord), activeSession, plaintext)
      return {
        deviceRecord: commitSesameEncryption(deviceRecord, activeSession.sessionId, encrypted.nextSessionState, encryptedAt),
        deviceMessage: {
          deviceId: deviceRecord.deviceId,
          sessionId: activeSession.sessionId,
          encryptedMessage: encrypted.encryptedMessage,
        },
      }
    })
  )
  const updatedDeviceById = new Map(encryptedDevices.map((result) => [result.deviceRecord.deviceId, result.deviceRecord]))

  return {
    userRecord: {
      ...userRecord,
      devices: userRecord.devices.map((deviceRecord) => updatedDeviceById.get(deviceRecord.deviceId) ?? deviceRecord),
    },
    deviceMessages: encryptedDevices.map((result) => result.deviceMessage),
  }
}

export async function decryptSesameMessage<SessionState, InitiationData, EncryptedMessage>(
  currentUserRecord: SesameUserRecord<SessionState, InitiationData> | null,
  input: SesameDecryptionInput<EncryptedMessage>,
  adapter: SesameSessionAdapter<SessionState, InitiationData, EncryptedMessage>,
  options: SesameDeviceSetReconciliationOptions
): Promise<SesameDecryptionResult<SessionState, InitiationData> | null> {
  if (currentUserRecord !== null && currentUserRecord.userId !== input.senderUserId) {
    throw new SesameInvalidStateError('Sesame user record does not match the message sender')
  }

  const existingDevice = currentUserRecord?.devices.find((deviceRecord) => deviceRecord.deviceId === input.senderDeviceId)
  if (existingDevice !== undefined) {
    const decrypted = await tryDecryptWithDevice(input.senderUserId, existingDevice, input.encryptedMessage, adapter)
    if (decrypted !== null) {
      return {
        userRecord: replaceDevice(
          currentUserRecord!,
          commitSesameDecryption(existingDevice, decrypted.sessionId, decrypted.result.nextSessionState, input.processedAt)
        ),
        plaintext: decrypted.result.plaintext,
        sessionId: decrypted.sessionId,
        sessionCreated: false,
        deviceChange: null,
      }
    }
  }

  if (!adapter.isInitiationMessage(input.encryptedMessage) || input.senderIdentity === null) {
    return null
  }

  const updated = conditionallyUpdateSesameDevice(currentUserRecord, input.senderUserId, identityTuple(input), options)
  const receivingDevice = updated.userRecord.devices.find((deviceRecord) => deviceRecord.deviceId === input.senderDeviceId)
  if (receivingDevice === undefined) return null

  const createdSession = await adapter.createReceivingSession(toRemoteDevice(input.senderUserId, receivingDevice), input.encryptedMessage)
  const session: SesameSessionRecord<SessionState, InitiationData> = {
    sessionId: createdSession.sessionId,
    phase: 'regular',
    state: createdSession.state,
    initiationData: null,
    createdAt: input.processedAt,
    lastUsedAt: input.processedAt,
  }
  const deviceWithSession = insertSesameSession(receivingDevice, session, options.limits.maxSessionsPerDevice)
  const decrypted = await adapter.tryDecrypt(toRemoteDevice(input.senderUserId, receivingDevice), session, input.encryptedMessage)
  if (decrypted === null) return null

  return {
    userRecord: replaceDevice(
      updated.userRecord,
      commitSesameDecryption(deviceWithSession, session.sessionId, decrypted.nextSessionState, input.processedAt)
    ),
    plaintext: decrypted.plaintext,
    sessionId: session.sessionId,
    sessionCreated: true,
    deviceChange: updated.change,
  }
}

async function tryDecryptWithDevice<SessionState, InitiationData, EncryptedMessage>(
  userId: string,
  deviceRecord: SesameDeviceRecord<SessionState, InitiationData>,
  encryptedMessage: EncryptedMessage,
  adapter: SesameSessionAdapter<SessionState, InitiationData, EncryptedMessage>
): Promise<{
  readonly sessionId: string
  readonly result: SesameSessionDecryptionResult<SessionState>
} | null> {
  for (const session of listSesameDecryptionCandidates(deviceRecord)) {
    const result = await adapter.tryDecrypt(toRemoteDevice(userId, deviceRecord), session, encryptedMessage)
    if (result !== null) return { sessionId: session.sessionId, result }
  }
  return null
}

function toRemoteDevice<SessionState, InitiationData>(
  userId: string,
  deviceRecord: SesameDeviceRecord<SessionState, InitiationData>
): SesameRemoteDevice {
  return {
    userId,
    deviceId: deviceRecord.deviceId,
    identity: deviceRecord.identity,
  }
}

function replaceDevice<SessionState, InitiationData>(
  userRecord: SesameUserRecord<SessionState, InitiationData>,
  updatedDevice: SesameDeviceRecord<SessionState, InitiationData>
): SesameUserRecord<SessionState, InitiationData> {
  return {
    ...userRecord,
    devices: userRecord.devices.map((deviceRecord) => (deviceRecord.deviceId === updatedDevice.deviceId ? updatedDevice : deviceRecord)),
  }
}

function identityTuple<EncryptedMessage>(input: SesameDecryptionInput<EncryptedMessage>): SesameDeviceIdentityTuple {
  if (input.senderIdentity === null) {
    throw new SesameInvalidStateError('An initiation message requires a sender identity')
  }
  return { deviceId: input.senderDeviceId, ...input.senderIdentity }
}
