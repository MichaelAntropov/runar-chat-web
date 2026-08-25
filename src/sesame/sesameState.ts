import { SesameInvalidStateError, SesameLimitExceededError, SesameSessionNotFoundError } from './types/sesameErrors'
import type {
  SesameDeviceIdentity,
  SesameDeviceIdentityTuple,
  SesameDeviceRecord,
  SesameDeviceSetChange,
  SesameDeviceSetReconciliationOptions,
  SesameDeviceSetReconciliationResult,
  SesameDeviceUpdateResult,
  SesameSessionRecord,
  SesameStaleRecordPruneOptions,
  SesameUserRecord,
} from './types/sesameTypes'

const X25519_PUBLIC_KEY_LENGTH = 32
const ED25519_PUBLIC_KEY_LENGTH = 32

export function createSesameUserRecord<SessionState, InitiationData = never>(userId: string): SesameUserRecord<SessionState, InitiationData> {
  validateId(userId, 'User ID')
  return { userId, staleSince: null, devices: [] }
}

export function reconcileSesameDeviceSet<SessionState, InitiationData = never>(
  currentUserRecord: SesameUserRecord<SessionState, InitiationData> | null,
  userId: string,
  activeDevices: readonly SesameDeviceIdentityTuple[],
  options: SesameDeviceSetReconciliationOptions
): SesameDeviceSetReconciliationResult<SessionState, InitiationData> {
  validateId(userId, 'User ID')
  validateTimestamp(options.observedAt, 'Observed timestamp')
  validateLimits(options.limits.maxDevicesPerUser, 'Maximum devices per user')
  validateLimits(options.limits.maxSessionsPerDevice, 'Maximum sessions per device')

  if (currentUserRecord !== null && currentUserRecord.userId !== userId) {
    throw new SesameInvalidStateError('Sesame user record does not match the reconciled user ID')
  }

  const relevantDevices = activeDevices.filter(
    (device) => userId !== options.localAddress.userId || device.deviceId !== options.localAddress.deviceId
  )
  validateDeviceTuples(relevantDevices)

  if (relevantDevices.length > options.limits.maxDevicesPerUser) {
    throw new SesameLimitExceededError('Sesame device count exceeds the configured limit')
  }

  const baseRecord =
    currentUserRecord === null || currentUserRecord.staleSince !== null
      ? createSesameUserRecord<SessionState, InitiationData>(userId)
      : currentUserRecord
  const activeDeviceById = new Map(relevantDevices.map((device) => [device.deviceId, device]))
  const existingDeviceIds = new Set(baseRecord.devices.map((device) => device.deviceId))
  const changes: SesameDeviceSetChange[] = []

  const reconciledExistingDevices = baseRecord.devices.map((existingDevice) => {
    const observedDevice = activeDeviceById.get(existingDevice.deviceId)
    if (observedDevice === undefined) {
      if (existingDevice.staleSince !== null) return existingDevice
      changes.push({ deviceId: existingDevice.deviceId, type: 'marked-stale' })
      return { ...existingDevice, staleSince: options.observedAt }
    }

    if (existingDevice.staleSince !== null) {
      changes.push({ deviceId: existingDevice.deviceId, type: 'reactivated' })
      return createSesameDeviceRecord<SessionState, InitiationData>(observedDevice)
    }

    if (!equalDeviceIdentities(existingDevice.identity, observedDevice)) {
      changes.push({ deviceId: existingDevice.deviceId, type: 'identity-changed' })
      return createSesameDeviceRecord<SessionState, InitiationData>(observedDevice)
    }

    return existingDevice
  })

  const addedDevices = relevantDevices
    .filter((device) => !existingDeviceIds.has(device.deviceId))
    .map((device) => {
      changes.push({ deviceId: device.deviceId, type: 'added' })
      return createSesameDeviceRecord<SessionState, InitiationData>(device)
    })

  const devices = [...reconciledExistingDevices, ...addedDevices]
  if (devices.length > options.limits.maxDevicesPerUser) {
    throw new SesameLimitExceededError('Sesame device-record count exceeds the configured storage limit')
  }

  return {
    userRecord: {
      userId,
      staleSince: null,
      devices,
    },
    changes,
  }
}

export function conditionallyUpdateSesameDevice<SessionState, InitiationData = never>(
  currentUserRecord: SesameUserRecord<SessionState, InitiationData> | null,
  userId: string,
  device: SesameDeviceIdentityTuple,
  options: SesameDeviceSetReconciliationOptions
): SesameDeviceUpdateResult<SessionState, InitiationData> {
  validateId(userId, 'User ID')
  validateTimestamp(options.observedAt, 'Observed timestamp')
  validateLimits(options.limits.maxDevicesPerUser, 'Maximum devices per user')
  validateLimits(options.limits.maxSessionsPerDevice, 'Maximum sessions per device')
  validateDeviceTuples([device])

  if (currentUserRecord !== null && currentUserRecord.userId !== userId) {
    throw new SesameInvalidStateError('Sesame user record does not match the updated user ID')
  }

  const baseRecord =
    currentUserRecord === null || currentUserRecord.staleSince !== null
      ? createSesameUserRecord<SessionState, InitiationData>(userId)
      : currentUserRecord

  if (userId === options.localAddress.userId && device.deviceId === options.localAddress.deviceId) {
    return { userRecord: baseRecord, change: null }
  }

  const existingIndex = baseRecord.devices.findIndex((existingDevice) => existingDevice.deviceId === device.deviceId)
  if (existingIndex === -1) {
    if (baseRecord.devices.length >= options.limits.maxDevicesPerUser) {
      throw new SesameLimitExceededError('Sesame device-record count exceeds the configured storage limit')
    }

    return {
      userRecord: {
        ...baseRecord,
        devices: [...baseRecord.devices, createSesameDeviceRecord<SessionState, InitiationData>(device)],
      },
      change: { deviceId: device.deviceId, type: 'added' },
    }
  }

  const existingDevice = baseRecord.devices[existingIndex]
  if (existingDevice.staleSince === null && equalDeviceIdentities(existingDevice.identity, device)) {
    return { userRecord: baseRecord, change: null }
  }

  const devices = [...baseRecord.devices]
  devices[existingIndex] = createSesameDeviceRecord<SessionState, InitiationData>(device)

  return {
    userRecord: { ...baseRecord, devices },
    change: {
      deviceId: device.deviceId,
      type: existingDevice.staleSince !== null ? 'reactivated' : 'identity-changed',
    },
  }
}

export function insertSesameSession<SessionState, InitiationData = never>(
  deviceRecord: SesameDeviceRecord<SessionState, InitiationData>,
  session: SesameSessionRecord<SessionState, InitiationData>,
  maxSessionsPerDevice: number
): SesameDeviceRecord<SessionState, InitiationData> {
  validateLimits(maxSessionsPerDevice, 'Maximum sessions per device')
  validateSession(session)

  if (deviceRecord.staleSince !== null) {
    throw new SesameInvalidStateError('Cannot insert a session into a stale device record')
  }

  const sessionIds = listSesameDecryptionCandidates(deviceRecord).map((candidate) => candidate.sessionId)
  if (sessionIds.includes(session.sessionId)) {
    throw new SesameInvalidStateError(`Duplicate Sesame session ID: ${session.sessionId}`)
  }

  const inactiveSessions = deviceRecord.activeSession
    ? [deviceRecord.activeSession, ...deviceRecord.inactiveSessions]
    : [...deviceRecord.inactiveSessions]

  return {
    ...deviceRecord,
    activeSession: session,
    inactiveSessions: inactiveSessions.slice(0, maxSessionsPerDevice - 1),
  }
}

export function commitSesameEncryption<SessionState, InitiationData = never>(
  deviceRecord: SesameDeviceRecord<SessionState, InitiationData>,
  sessionId: string,
  nextSessionState: SessionState,
  usedAt: number
): SesameDeviceRecord<SessionState, InitiationData> {
  validateTimestamp(usedAt, 'Session usage timestamp')

  if (deviceRecord.activeSession?.sessionId !== sessionId) {
    throw new SesameInvalidStateError('Sesame encryption must use the active session')
  }

  return {
    ...deviceRecord,
    activeSession: {
      ...deviceRecord.activeSession,
      state: nextSessionState,
      lastUsedAt: usedAt,
    },
  }
}

export function commitSesameDecryption<SessionState, InitiationData = never>(
  deviceRecord: SesameDeviceRecord<SessionState, InitiationData>,
  sessionId: string,
  nextSessionState: SessionState,
  usedAt: number
): SesameDeviceRecord<SessionState, InitiationData> {
  validateTimestamp(usedAt, 'Session usage timestamp')

  const successfulSession = listSesameDecryptionCandidates(deviceRecord).find((session) => session.sessionId === sessionId)
  if (successfulSession === undefined) throw new SesameSessionNotFoundError(sessionId)

  const updatedSession: SesameSessionRecord<SessionState, InitiationData> = {
    ...successfulSession,
    phase: 'regular',
    state: nextSessionState,
    initiationData: null,
    lastUsedAt: usedAt,
  }

  if (deviceRecord.activeSession?.sessionId === sessionId) {
    return { ...deviceRecord, activeSession: updatedSession }
  }

  const remainingInactiveSessions = deviceRecord.inactiveSessions.filter((session) => session.sessionId !== sessionId)

  return {
    ...deviceRecord,
    activeSession: updatedSession,
    inactiveSessions: deviceRecord.activeSession ? [deviceRecord.activeSession, ...remainingInactiveSessions] : remainingInactiveSessions,
  }
}

export function listSesameDecryptionCandidates<SessionState, InitiationData = never>(
  deviceRecord: SesameDeviceRecord<SessionState, InitiationData>
): readonly SesameSessionRecord<SessionState, InitiationData>[] {
  return deviceRecord.activeSession ? [deviceRecord.activeSession, ...deviceRecord.inactiveSessions] : deviceRecord.inactiveSessions
}

export function markSesameUserStale<SessionState, InitiationData = never>(
  userRecord: SesameUserRecord<SessionState, InitiationData>,
  staleSince: number
): SesameUserRecord<SessionState, InitiationData> {
  validateTimestamp(staleSince, 'Stale timestamp')
  if (userRecord.staleSince !== null) return userRecord
  return { ...userRecord, staleSince }
}

export function pruneStaleSesameRecords<SessionState, InitiationData = never>(
  userRecords: readonly SesameUserRecord<SessionState, InitiationData>[],
  options: SesameStaleRecordPruneOptions
): readonly SesameUserRecord<SessionState, InitiationData>[] {
  validateTimestamp(options.now, 'Current timestamp')
  validateNonNegativeDuration(options.maxLatencyMs, 'Maximum latency')
  if (options.mailboxDrainedAt !== null) {
    validateTimestamp(options.mailboxDrainedAt, 'Mailbox drain timestamp')
  }

  return userRecords.flatMap((userRecord) => {
    if (canPrune(userRecord.staleSince, options)) return []

    const devices = userRecord.devices.filter((deviceRecord) => !canPrune(deviceRecord.staleSince, options))
    if (devices.length === 0 && userRecord.devices.length > 0) return []
    return [{ ...userRecord, devices }]
  })
}

function createSesameDeviceRecord<SessionState, InitiationData>(device: SesameDeviceIdentityTuple): SesameDeviceRecord<SessionState, InitiationData> {
  validateId(device.deviceId, 'Device ID')
  validateDeviceIdentity(device)

  return {
    deviceId: device.deviceId,
    identity: {
      x25519PublicKey: device.x25519PublicKey.slice(),
      ed25519PublicKey: device.ed25519PublicKey.slice(),
    },
    staleSince: null,
    activeSession: null,
    inactiveSessions: [],
  }
}

function equalDeviceIdentities(left: SesameDeviceIdentity, right: SesameDeviceIdentity): boolean {
  return equalBytes(left.x25519PublicKey, right.x25519PublicKey) && equalBytes(left.ed25519PublicKey, right.ed25519PublicKey)
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  return left.every((value, index) => value === right[index])
}

function canPrune(staleSince: number | null, options: SesameStaleRecordPruneOptions): boolean {
  if (staleSince === null || options.mailboxDrainedAt === null) return false
  const safeAfter = staleSince + options.maxLatencyMs
  return options.now >= safeAfter && options.mailboxDrainedAt >= safeAfter
}

function validateDeviceTuples(devices: readonly SesameDeviceIdentityTuple[]): void {
  const deviceIds = new Set<string>()
  for (const device of devices) {
    validateId(device.deviceId, 'Device ID')
    validateDeviceIdentity(device)
    if (deviceIds.has(device.deviceId)) {
      throw new SesameInvalidStateError(`Duplicate Sesame device ID: ${device.deviceId}`)
    }
    deviceIds.add(device.deviceId)
  }
}

function validateDeviceIdentity(identity: SesameDeviceIdentity): void {
  if (identity.x25519PublicKey.byteLength !== X25519_PUBLIC_KEY_LENGTH) {
    throw new SesameInvalidStateError('Sesame X25519 identity public key must be 32 bytes')
  }
  if (identity.ed25519PublicKey.byteLength !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new SesameInvalidStateError('Sesame Ed25519 identity public key must be 32 bytes')
  }
}

function validateSession<SessionState, InitiationData>(session: SesameSessionRecord<SessionState, InitiationData>): void {
  validateId(session.sessionId, 'Session ID')
  validateTimestamp(session.createdAt, 'Session creation timestamp')
  validateTimestamp(session.lastUsedAt, 'Session usage timestamp')

  if (session.lastUsedAt < session.createdAt) {
    throw new SesameInvalidStateError('Session usage timestamp precedes its creation')
  }
  if (session.phase === 'regular' && session.initiationData !== null) {
    throw new SesameInvalidStateError('Regular Sesame sessions cannot retain initiation data')
  }
  if (session.phase === 'initiating' && session.initiationData === null) {
    throw new SesameInvalidStateError('Initiating Sesame sessions require initiation data')
  }
}

function validateId(value: string, name: string): void {
  if (value.trim().length === 0) throw new SesameInvalidStateError(`${name} must not be empty`)
}

function validateTimestamp(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SesameInvalidStateError(`${name} must be a non-negative safe integer`)
  }
}

function validateLimits(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new SesameInvalidStateError(`${name} must be a positive safe integer`)
  }
}

function validateNonNegativeDuration(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SesameInvalidStateError(`${name} must be a non-negative safe integer`)
  }
}
