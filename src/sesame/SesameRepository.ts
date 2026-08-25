import type { RunarDb } from '@/db/RunarDB'
import { SESAME_DEVICES_STORE, SESAME_SESSIONS_STORE, SESAME_USERS_STORE } from '@/db/RunarDB'

import type { SesameDevice, SesameSession, SesameUser } from './entities/sesameEntities'
import { SesameConcurrentModificationError, SesameInvalidStateError } from './types/sesameErrors'
import type { SesameDeviceRecord, SesameSessionRecord, SesameUserProjection, SesameUserRecord } from './types/sesameTypes'

export class SesameRepository<SessionState, InitiationData = never> {
  constructor(private readonly db: RunarDb) {}

  async loadUserRecord(userId: string): Promise<SesameUserProjection<SessionState, InitiationData> | null> {
    return this.db.transaction('r', this.db[SESAME_USERS_STORE], this.db[SESAME_DEVICES_STORE], this.db[SESAME_SESSIONS_STORE], async () => {
      const storedUser = await this.db[SESAME_USERS_STORE].get(userId)
      if (!storedUser) return null

      const [storedDevices, storedSessions] = await Promise.all([
        this.db[SESAME_DEVICES_STORE].where('userId').equals(userId).toArray(),
        this.db[SESAME_SESSIONS_STORE].where('userId').equals(userId).toArray(),
      ])

      return {
        entityVersion: storedUser.entityVersion,
        userRecord: assembleUserRecord<SessionState, InitiationData>(
          storedUser,
          storedDevices,
          storedSessions as SesameSession<SessionState, InitiationData>[]
        ),
      }
    })
  }

  async saveUserRecord(
    previous: SesameUserProjection<SessionState, InitiationData> | null,
    nextUserRecord: SesameUserRecord<SessionState, InitiationData>
  ): Promise<SesameUserProjection<SessionState, InitiationData>> {
    return this.db.transaction('rw', this.db[SESAME_USERS_STORE], this.db[SESAME_DEVICES_STORE], this.db[SESAME_SESSIONS_STORE], () =>
      this.saveUserRecordInCurrentTransaction(previous, nextUserRecord)
    )
  }

  /**
   * Commits a projection using the caller's active Dexie transaction.
   * The transaction must include all three Sesame stores.
   */
  async saveUserRecordInCurrentTransaction(
    previous: SesameUserProjection<SessionState, InitiationData> | null,
    nextUserRecord: SesameUserRecord<SessionState, InitiationData>
  ): Promise<SesameUserProjection<SessionState, InitiationData>> {
    if (previous !== null && previous.userRecord.userId !== nextUserRecord.userId) {
      throw new SesameInvalidStateError('Cannot change the UserID of a Sesame projection')
    }

    const userId = nextUserRecord.userId
    const previousDeviceRows = previous ? toStoredDevices(previous.userRecord) : new Map<string, SesameDevice>()
    const previousSessionRows = previous ? toStoredSessions(previous.userRecord) : new Map<string, SesameSession<SessionState, InitiationData>>()
    const nextDeviceRows = toStoredDevices(nextUserRecord)
    const nextSessionRows = toStoredSessions(nextUserRecord)

    const currentUser = await this.db[SESAME_USERS_STORE].get(userId)
    assertExpectedEntityVersion(userId, currentUser, previous?.entityVersion ?? null)

    const nextEntityVersion = (currentUser?.entityVersion ?? 0) + 1
    await this.db[SESAME_USERS_STORE].put({
      userId,
      staleSince: nextUserRecord.staleSince,
      entityVersion: nextEntityVersion,
    })

    const removedSessionIds = difference(previousSessionRows.keys(), nextSessionRows)
    if (removedSessionIds.length > 0) {
      await this.db[SESAME_SESSIONS_STORE].bulkDelete(removedSessionIds)
    }

    const removedDeviceKeys = difference(previousDeviceRows.keys(), nextDeviceRows).map((deviceId): [string, string] => [userId, deviceId])
    if (removedDeviceKeys.length > 0) {
      await this.db[SESAME_DEVICES_STORE].bulkDelete(removedDeviceKeys)
    }

    const changedDeviceRows = [...nextDeviceRows.values()].filter((row) => !equalStoredDevice(previousDeviceRows.get(row.deviceId), row))
    if (changedDeviceRows.length > 0) {
      await this.db[SESAME_DEVICES_STORE].bulkPut(changedDeviceRows)
    }

    const changedSessionRows = [...nextSessionRows.values()].filter((row) => !equalStoredSession(previousSessionRows.get(row.sessionId), row))
    if (changedSessionRows.length > 0) {
      await this.db[SESAME_SESSIONS_STORE].bulkPut(changedSessionRows as SesameSession[])
    }

    return { entityVersion: nextEntityVersion, userRecord: nextUserRecord }
  }

  async deleteUserRecord(projection: SesameUserProjection<SessionState, InitiationData>): Promise<void> {
    const userId = projection.userRecord.userId

    await this.db.transaction('rw', this.db[SESAME_USERS_STORE], this.db[SESAME_DEVICES_STORE], this.db[SESAME_SESSIONS_STORE], async () => {
      const currentUser = await this.db[SESAME_USERS_STORE].get(userId)
      assertExpectedEntityVersion(userId, currentUser, projection.entityVersion)

      const [deviceKeys, sessionIds] = await Promise.all([
        this.db[SESAME_DEVICES_STORE].where('userId').equals(userId).primaryKeys(),
        this.db[SESAME_SESSIONS_STORE].where('userId').equals(userId).primaryKeys(),
      ])

      if (sessionIds.length > 0) {
        await this.db[SESAME_SESSIONS_STORE].bulkDelete(sessionIds as string[])
      }
      if (deviceKeys.length > 0) {
        await this.db[SESAME_DEVICES_STORE].bulkDelete(deviceKeys as [string, string][])
      }
      await this.db[SESAME_USERS_STORE].delete(userId)
    })
  }
}

function assembleUserRecord<SessionState, InitiationData>(
  storedUser: SesameUser,
  storedDevices: SesameDevice[],
  storedSessions: SesameSession<SessionState, InitiationData>[]
): SesameUserRecord<SessionState, InitiationData> {
  validateStoredUser(storedUser)
  const devicesById = new Map(storedDevices.map((device) => [device.deviceId, device]))

  for (const session of storedSessions) {
    if (!devicesById.has(session.deviceId)) {
      throw new SesameInvalidStateError(`Sesame session ${session.sessionId} references a missing device`)
    }
  }

  const devices = storedDevices
    .map((device) =>
      assembleDeviceRecord(
        device,
        storedSessions.filter((session) => session.deviceId === device.deviceId)
      )
    )
    .sort((left, right) => left.deviceId.localeCompare(right.deviceId))

  return { userId: storedUser.userId, staleSince: storedUser.staleSince, devices }
}

function assembleDeviceRecord<SessionState, InitiationData>(
  device: SesameDevice,
  sessions: SesameSession<SessionState, InitiationData>[]
): SesameDeviceRecord<SessionState, InitiationData> {
  validateStoredDevice(device)
  const activeRow = device.activeSessionId === null ? null : (sessions.find((session) => session.sessionId === device.activeSessionId) ?? null)

  if (device.activeSessionId !== null && activeRow === null) {
    throw new SesameInvalidStateError(`Sesame device ${device.deviceId} references a missing active session`)
  }
  if (activeRow?.inactiveOrder !== null) {
    throw new SesameInvalidStateError('An active Sesame session cannot have inactive ordering')
  }

  const inactiveRows = sessions
    .filter((session) => session.sessionId !== device.activeSessionId)
    .sort((left, right) => requiredInactiveOrder(left) - requiredInactiveOrder(right))
  inactiveRows.forEach((session, index) => {
    if (session.inactiveOrder !== index) {
      throw new SesameInvalidStateError('Inactive Sesame session ordering is not contiguous')
    }
  })

  return {
    deviceId: device.deviceId,
    identity: device.identity,
    staleSince: device.staleSince,
    activeSession: activeRow ? toSessionRecord(activeRow) : null,
    inactiveSessions: inactiveRows.map(toSessionRecord),
  }
}

function toStoredDevices<SessionState, InitiationData>(userRecord: SesameUserRecord<SessionState, InitiationData>): Map<string, SesameDevice> {
  return new Map(
    userRecord.devices.map((device) => [
      device.deviceId,
      {
        userId: userRecord.userId,
        deviceId: device.deviceId,
        identity: device.identity,
        staleSince: device.staleSince,
        activeSessionId: device.activeSession?.sessionId ?? null,
      },
    ])
  )
}

function toStoredSessions<SessionState, InitiationData>(
  userRecord: SesameUserRecord<SessionState, InitiationData>
): Map<string, SesameSession<SessionState, InitiationData>> {
  const result = new Map<string, SesameSession<SessionState, InitiationData>>()

  for (const device of userRecord.devices) {
    if (device.activeSession) {
      insertStoredSession(result, userRecord.userId, device.deviceId, device.activeSession, null)
    }
    device.inactiveSessions.forEach((session, index) => {
      insertStoredSession(result, userRecord.userId, device.deviceId, session, index)
    })
  }

  return result
}

function insertStoredSession<SessionState, InitiationData>(
  sessions: Map<string, SesameSession<SessionState, InitiationData>>,
  userId: string,
  deviceId: string,
  session: SesameSessionRecord<SessionState, InitiationData>,
  inactiveOrder: number | null
): void {
  if (sessions.has(session.sessionId)) {
    throw new SesameInvalidStateError(`Duplicate Sesame session ID: ${session.sessionId}`)
  }

  sessions.set(session.sessionId, {
    sessionId: session.sessionId,
    userId,
    deviceId,
    phase: session.phase,
    state: session.state,
    initiationData: session.initiationData,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    inactiveOrder,
  })
}

function toSessionRecord<SessionState, InitiationData>(
  session: SesameSession<SessionState, InitiationData>
): SesameSessionRecord<SessionState, InitiationData> {
  return {
    sessionId: session.sessionId,
    phase: session.phase,
    state: session.state,
    initiationData: session.initiationData,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
  }
}

function assertExpectedEntityVersion(userId: string, current: SesameUser | undefined, expectedEntityVersion: number | null): void {
  if (
    (expectedEntityVersion === null && current !== undefined) ||
    (expectedEntityVersion !== null && current?.entityVersion !== expectedEntityVersion)
  ) {
    throw new SesameConcurrentModificationError(userId)
  }
}

function difference(previousIds: IterableIterator<string>, nextRows: ReadonlyMap<string, unknown>): string[] {
  return [...previousIds].filter((id) => !nextRows.has(id))
}

function equalStoredDevice(left: SesameDevice | undefined, right: SesameDevice): boolean {
  return (
    left !== undefined &&
    left.userId === right.userId &&
    left.deviceId === right.deviceId &&
    left.staleSince === right.staleSince &&
    left.activeSessionId === right.activeSessionId &&
    equalBytes(left.identity.x25519PublicKey, right.identity.x25519PublicKey) &&
    equalBytes(left.identity.ed25519PublicKey, right.identity.ed25519PublicKey)
  )
}

function equalStoredSession<SessionState, InitiationData>(
  left: SesameSession<SessionState, InitiationData> | undefined,
  right: SesameSession<SessionState, InitiationData>
): boolean {
  return (
    left !== undefined &&
    left.userId === right.userId &&
    left.deviceId === right.deviceId &&
    left.phase === right.phase &&
    left.state === right.state &&
    left.initiationData === right.initiationData &&
    left.createdAt === right.createdAt &&
    left.lastUsedAt === right.lastUsedAt &&
    left.inactiveOrder === right.inactiveOrder
  )
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
}

function requiredInactiveOrder(session: SesameSession): number {
  if (!Number.isSafeInteger(session.inactiveOrder) || session.inactiveOrder! < 0) {
    throw new SesameInvalidStateError('Inactive Sesame session has invalid ordering')
  }
  return session.inactiveOrder!
}

function validateStoredUser(user: SesameUser): void {
  if (!Number.isSafeInteger(user.entityVersion) || user.entityVersion < 1) {
    throw new SesameInvalidStateError('Sesame entityVersion must be a positive safe integer')
  }
}

function validateStoredDevice(device: SesameDevice): void {
  if (device.identity.x25519PublicKey.byteLength !== 32 || device.identity.ed25519PublicKey.byteLength !== 32) {
    throw new SesameInvalidStateError('Stored Sesame device identity has an invalid length')
  }
}
