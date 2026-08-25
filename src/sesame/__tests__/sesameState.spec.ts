import { describe, expect, it } from 'vitest'

import {
  commitSesameDecryption,
  commitSesameEncryption,
  createSesameUserRecord,
  insertSesameSession,
  listSesameDecryptionCandidates,
  markSesameUserStale,
  pruneStaleSesameRecords,
  reconcileSesameDeviceSet,
} from '@/sesame/sesameState'
import { SesameInvalidStateError } from '@/sesame/types/sesameErrors'
import type { SesameDeviceIdentityTuple, SesameDeviceRecord, SesameSessionRecord } from '@/sesame/types/sesameTypes'

const LOCAL_USER_ID = 'local-user'
const LOCAL_DEVICE_ID = 'local-device'
const REMOTE_USER_ID = 'remote-user'
const NOW = 1_000
const LIMITS = { maxDevicesPerUser: 4, maxSessionsPerDevice: 3 }

interface TestSessionState {
  readonly step: number
}

interface TestInitiationData {
  readonly signedPreKeyId: string
}

describe('Sesame device-set reconciliation', () => {
  it('creates remote device records without coupling them to local key material', () => {
    const result = reconcileSesameDeviceSet<TestSessionState>(
      null,
      REMOTE_USER_ID,
      [device('remote-device-1', 1), device('remote-device-2', 2)],
      reconciliationOptions()
    )

    expect(result.userRecord.devices.map((record) => record.deviceId)).toEqual(['remote-device-1', 'remote-device-2'])
    expect(result.changes).toEqual([
      { deviceId: 'remote-device-1', type: 'added' },
      { deviceId: 'remote-device-2', type: 'added' },
    ])
  })

  it('does not create a DeviceRecord for the local device in the local UserRecord', () => {
    const result = reconcileSesameDeviceSet<TestSessionState>(
      null,
      LOCAL_USER_ID,
      [device(LOCAL_DEVICE_ID, 1), device('other-local-device', 2)],
      reconciliationOptions()
    )

    expect(result.userRecord.devices.map((record) => record.deviceId)).toEqual(['other-local-device'])
  })

  it('marks missing devices stale instead of deleting their sessions', () => {
    const initial = reconcileSesameDeviceSet<TestSessionState>(
      null,
      REMOTE_USER_ID,
      [device('remote-device-1', 1)],
      reconciliationOptions()
    ).userRecord
    const withSession = {
      ...initial,
      devices: [insertSesameSession(initial.devices[0], regularSession('session-1', 1), 3)],
    }

    const result = reconcileSesameDeviceSet(withSession, REMOTE_USER_ID, [], reconciliationOptions())

    expect(result.userRecord.devices[0].staleSince).toBe(NOW)
    expect(result.userRecord.devices[0].activeSession?.sessionId).toBe('session-1')
    expect(result.changes).toEqual([{ deviceId: 'remote-device-1', type: 'marked-stale' }])
  })

  it('replaces a device and all its sessions when its identity changes', () => {
    const initial = reconcileSesameDeviceSet<TestSessionState>(
      null,
      REMOTE_USER_ID,
      [device('remote-device-1', 1)],
      reconciliationOptions()
    ).userRecord
    const withSession = {
      ...initial,
      devices: [insertSesameSession(initial.devices[0], regularSession('session-1', 1), 3)],
    }

    const result = reconcileSesameDeviceSet(withSession, REMOTE_USER_ID, [device('remote-device-1', 9)], reconciliationOptions())

    expect(result.userRecord.devices[0].activeSession).toBeNull()
    expect(result.userRecord.devices[0].inactiveSessions).toEqual([])
    expect(result.changes).toEqual([{ deviceId: 'remote-device-1', type: 'identity-changed' }])
  })

  it('recreates a stale device instead of reviving its orphaned sessions', () => {
    const initial = reconcileSesameDeviceSet<TestSessionState>(
      null,
      REMOTE_USER_ID,
      [device('remote-device-1', 1)],
      reconciliationOptions()
    ).userRecord
    const withSession = {
      ...initial,
      devices: [insertSesameSession(initial.devices[0], regularSession('session-1', 1), 3)],
    }
    const stale = reconcileSesameDeviceSet(withSession, REMOTE_USER_ID, [], reconciliationOptions()).userRecord

    const result = reconcileSesameDeviceSet(stale, REMOTE_USER_ID, [device('remote-device-1', 1)], {
      ...reconciliationOptions(),
      observedAt: NOW + 1,
    })

    expect(result.userRecord.devices[0].activeSession).toBeNull()
    expect(result.userRecord.devices[0].staleSince).toBeNull()
    expect(result.changes).toEqual([{ deviceId: 'remote-device-1', type: 'reactivated' }])
  })
})

describe('Sesame session convergence', () => {
  it('inserts new sessions as active and keeps a bounded newest-first inactive list', () => {
    let record = emptyDeviceRecord()
    record = insertSesameSession(record, regularSession('session-1', 1), 3)
    record = insertSesameSession(record, regularSession('session-2', 2), 3)
    record = insertSesameSession(record, regularSession('session-3', 3), 3)
    record = insertSesameSession(record, regularSession('session-4', 4), 3)

    expect(record.activeSession?.sessionId).toBe('session-4')
    expect(record.inactiveSessions.map((session) => session.sessionId)).toEqual(['session-3', 'session-2'])
  })

  it('promotes an inactive session after successful decryption', () => {
    let record = emptyDeviceRecord()
    record = insertSesameSession(record, regularSession('alice-session', 1), 3)
    record = insertSesameSession(record, regularSession('bob-session', 2), 3)

    const converged = commitSesameDecryption(record, 'alice-session', { step: 8 }, NOW)

    expect(converged.activeSession).toMatchObject({
      sessionId: 'alice-session',
      state: { step: 8 },
      lastUsedAt: NOW,
    })
    expect(converged.inactiveSessions.map((session) => session.sessionId)).toEqual(['bob-session'])
    expect(listSesameDecryptionCandidates(converged).map((session) => session.sessionId)).toEqual(['alice-session', 'bob-session'])
  })

  it('turns an initiating session regular only after a successful response decrypts', () => {
    const initiationData = { signedPreKeyId: 'signed-pre-key-1' }
    const initiatingSession: SesameSessionRecord<TestSessionState, TestInitiationData> = {
      sessionId: 'session-1',
      phase: 'initiating',
      state: { step: 1 },
      initiationData,
      createdAt: 1,
      lastUsedAt: 1,
    }
    const record = insertSesameSession(emptyDeviceRecord<TestInitiationData>(), initiatingSession, 3)
    const afterSend = commitSesameEncryption(record, 'session-1', { step: 2 }, 2)

    expect(afterSend.activeSession).toMatchObject({
      phase: 'initiating',
      initiationData,
    })

    const afterResponse = commitSesameDecryption(afterSend, 'session-1', { step: 3 }, 3)

    expect(afterResponse.activeSession).toMatchObject({
      phase: 'regular',
      initiationData: null,
      state: { step: 3 },
    })
  })

  it('rejects encryption with an inactive session', () => {
    let record = emptyDeviceRecord()
    record = insertSesameSession(record, regularSession('session-1', 1), 3)
    record = insertSesameSession(record, regularSession('session-2', 2), 3)

    expect(() => commitSesameEncryption(record, 'session-1', { step: 3 }, NOW)).toThrow(SesameInvalidStateError)
  })
})

describe('Sesame stale-record cleanup', () => {
  it('requires both MAXLATENCY and a subsequent complete mailbox drain', () => {
    const maxLatencyMs = 30 * 24 * 60 * 60 * 1_000
    const staleAt = 10_000
    const safeAfter = staleAt + maxLatencyMs
    const staleRecord = markSesameUserStale(createSesameUserRecord<TestSessionState>(REMOTE_USER_ID), staleAt)

    expect(
      pruneStaleSesameRecords([staleRecord], {
        now: safeAfter,
        mailboxDrainedAt: null,
        maxLatencyMs,
      })
    ).toHaveLength(1)
    expect(
      pruneStaleSesameRecords([staleRecord], {
        now: safeAfter,
        mailboxDrainedAt: safeAfter - 1,
        maxLatencyMs,
      })
    ).toHaveLength(1)
    expect(
      pruneStaleSesameRecords([staleRecord], {
        now: safeAfter,
        mailboxDrainedAt: safeAfter,
        maxLatencyMs,
      })
    ).toEqual([])
  })
})

function reconciliationOptions() {
  return {
    localAddress: { userId: LOCAL_USER_ID, deviceId: LOCAL_DEVICE_ID },
    observedAt: NOW,
    limits: LIMITS,
  }
}

function device(deviceId: string, seed: number): SesameDeviceIdentityTuple {
  return {
    deviceId,
    x25519PublicKey: new Uint8Array(32).fill(seed),
    ed25519PublicKey: new Uint8Array(32).fill(seed + 1),
  }
}

function emptyDeviceRecord<InitiationData = never>(): SesameDeviceRecord<TestSessionState, InitiationData> {
  return {
    deviceId: 'remote-device-1',
    identity: device('remote-device-1', 1),
    staleSince: null,
    activeSession: null,
    inactiveSessions: [],
  }
}

function regularSession(sessionId: string, step: number): SesameSessionRecord<TestSessionState> {
  return {
    sessionId,
    phase: 'regular',
    state: { step },
    initiationData: null,
    createdAt: step,
    lastUsedAt: step,
  }
}
