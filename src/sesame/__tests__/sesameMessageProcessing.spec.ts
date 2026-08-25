import { describe, expect, it } from 'vitest'

import { decryptSesameMessage, encryptSesameMessageForUser, ensureActiveSesameSessions } from '@/sesame/sesameMessageProcessing'
import { insertSesameSession, reconcileSesameDeviceSet } from '@/sesame/sesameState'
import type {
  SesameCreatedInitiatingSession,
  SesameCreatedReceivingSession,
  SesameRemoteDevice,
  SesameSessionAdapter,
  SesameSessionDecryptionResult,
  SesameSessionEncryptionResult,
} from '@/sesame/types/sesameSessionAdapter'
import type { SesameDeviceIdentity, SesameDeviceRecord, SesameSessionRecord, SesameUserRecord } from '@/sesame/types/sesameTypes'

const LOCAL_USER_ID = 'local-user'
const LOCAL_DEVICE_ID = 'local-device'
const REMOTE_USER_ID = 'remote-user'
const OPTIONS = {
  localAddress: { userId: LOCAL_USER_ID, deviceId: LOCAL_DEVICE_ID },
  observedAt: 100,
  limits: { maxDevicesPerUser: 5, maxSessionsPerDevice: 3 },
}

interface TestSessionState {
  readonly step: number
}

interface TestInitiationData {
  readonly signedPreKeyId: string
}

interface TestEncryptedMessage {
  readonly initiation: boolean
  readonly sessionId: string
  readonly payload: Uint8Array<ArrayBuffer>
  readonly decryptable: boolean
}

describe('Sesame send processing', () => {
  it('creates initiating sessions only for non-stale devices without an active session', async () => {
    const userRecord = remoteUserRecord(['device-1', 'device-2'])
    const existingSession = regularSession('existing-session', 1)
    const withExistingSession = replaceDevice(userRecord, insertSesameSession(userRecord.devices[0], existingSession, 3))
    const withStaleDevice: SesameUserRecord<TestSessionState, TestInitiationData> = {
      ...withExistingSession,
      devices: [withExistingSession.devices[0], { ...withExistingSession.devices[1], staleSince: 50 }],
    }
    const adapter = new TestSessionAdapter()

    const prepared = await ensureActiveSesameSessions(withStaleDevice, adapter, 200, 3)

    expect(adapter.createdInitiatingSessionCount).toBe(0)
    expect(prepared.devices[0].activeSession).toBe(existingSession)
    expect(prepared.devices[1].activeSession).toBeNull()
  })

  it('returns candidate encrypted state without mutating the supplied user record', async () => {
    const initial = remoteUserRecord(['device-1', 'device-2'])
    const adapter = new TestSessionAdapter()
    const prepared = await ensureActiveSesameSessions(initial, adapter, 200, 3)

    const result = await encryptSesameMessageForUser(prepared, bytes('hello'), adapter, 300)

    expect(result.deviceMessages).toHaveLength(2)
    expect(result.userRecord.devices.map((record) => record.activeSession?.state.step)).toEqual([1, 1])
    expect(result.userRecord.devices.map((record) => record.activeSession?.phase)).toEqual(['initiating', 'initiating'])
    expect(prepared.devices.map((record) => record.activeSession?.state.step)).toEqual([0, 0])
  })

  it('returns no candidate state when encryption fails for any target device', async () => {
    const initial = remoteUserRecord(['device-1', 'device-2'])
    const adapter = new TestSessionAdapter()
    const prepared = await ensureActiveSesameSessions(initial, adapter, 200, 3)
    adapter.failEncryptionForSessionId = prepared.devices[1].activeSession!.sessionId

    await expect(encryptSesameMessageForUser(prepared, bytes('hello'), adapter, 300)).rejects.toThrow('test encryption failure')
    expect(prepared.devices.map((record) => record.activeSession?.state.step)).toEqual([0, 0])
  })
})

describe('Sesame receive processing', () => {
  it('tries inactive sessions and promotes the one that decrypts successfully', async () => {
    const initial = remoteUserRecord(['device-1'])
    let deviceRecord = insertSesameSession(initial.devices[0], regularSession('session-a', 1), 3)
    deviceRecord = insertSesameSession(deviceRecord, regularSession('session-b', 2), 3)
    const userRecord = replaceDevice(initial, deviceRecord)
    const adapter = new TestSessionAdapter()

    const result = await decryptSesameMessage(
      userRecord,
      {
        senderUserId: REMOTE_USER_ID,
        senderDeviceId: 'device-1',
        senderIdentity: null,
        encryptedMessage: encryptedMessage('session-a', false, true),
        processedAt: 400,
      },
      adapter,
      OPTIONS
    )

    expect(result?.sessionId).toBe('session-a')
    expect(result?.userRecord.devices[0].activeSession).toMatchObject({
      sessionId: 'session-a',
      state: { step: 2 },
    })
    expect(result?.userRecord.devices[0].inactiveSessions[0].sessionId).toBe('session-b')
  })

  it('creates and commits a receiving session only after initiation decryption succeeds', async () => {
    const adapter = new TestSessionAdapter()
    const message = encryptedMessage('received-session', true, true)

    const result = await decryptSesameMessage(
      null,
      {
        senderUserId: REMOTE_USER_ID,
        senderDeviceId: 'device-1',
        senderIdentity: identity(1),
        encryptedMessage: message,
        processedAt: 400,
      },
      adapter,
      OPTIONS
    )

    expect(result?.plaintext).toEqual(message.payload)
    expect(result?.deviceChange).toEqual({ deviceId: 'device-1', type: 'added' })
    expect(result?.userRecord.devices[0].activeSession).toMatchObject({
      sessionId: 'received-session',
      phase: 'regular',
      state: { step: 1 },
    })
  })

  it('discards all tentative record and session changes when initiation decryption fails', async () => {
    const initial = remoteUserRecord(['device-1'])
    const adapter = new TestSessionAdapter()

    const result = await decryptSesameMessage(
      initial,
      {
        senderUserId: REMOTE_USER_ID,
        senderDeviceId: 'device-2',
        senderIdentity: identity(2),
        encryptedMessage: encryptedMessage('received-session', true, false),
        processedAt: 400,
      },
      adapter,
      OPTIONS
    )

    expect(result).toBeNull()
    expect(initial.devices.map((record) => record.deviceId)).toEqual(['device-1'])
  })
})

class TestSessionAdapter implements SesameSessionAdapter<TestSessionState, TestInitiationData, TestEncryptedMessage> {
  createdInitiatingSessionCount = 0
  failEncryptionForSessionId: string | null = null

  async createInitiatingSession(): Promise<SesameCreatedInitiatingSession<TestSessionState, TestInitiationData>> {
    this.createdInitiatingSessionCount += 1
    return {
      sessionId: `created-session-${this.createdInitiatingSessionCount}`,
      state: { step: 0 },
      initiationData: { signedPreKeyId: `signed-pre-key-${this.createdInitiatingSessionCount}` },
    }
  }

  async createReceivingSession(
    _remoteDevice: SesameRemoteDevice,
    encrypted: TestEncryptedMessage
  ): Promise<SesameCreatedReceivingSession<TestSessionState>> {
    return { sessionId: encrypted.sessionId, state: { step: 0 } }
  }

  async encrypt(
    _remoteDevice: SesameRemoteDevice,
    session: SesameSessionRecord<TestSessionState, TestInitiationData>,
    plaintext: Uint8Array<ArrayBuffer>
  ): Promise<SesameSessionEncryptionResult<TestSessionState, TestEncryptedMessage>> {
    if (session.sessionId === this.failEncryptionForSessionId) {
      throw new Error('test encryption failure')
    }
    return {
      encryptedMessage: {
        initiation: session.phase === 'initiating',
        sessionId: session.sessionId,
        payload: plaintext.slice(),
        decryptable: true,
      },
      nextSessionState: { step: session.state.step + 1 },
    }
  }

  async tryDecrypt(
    _remoteDevice: SesameRemoteDevice,
    session: SesameSessionRecord<TestSessionState, TestInitiationData>,
    encrypted: TestEncryptedMessage
  ): Promise<SesameSessionDecryptionResult<TestSessionState> | null> {
    if (!encrypted.decryptable || encrypted.sessionId !== session.sessionId) return null
    return {
      plaintext: encrypted.payload.slice(),
      nextSessionState: { step: session.state.step + 1 },
    }
  }

  isInitiationMessage(encrypted: TestEncryptedMessage): boolean {
    return encrypted.initiation
  }
}

function remoteUserRecord(deviceIds: string[]): SesameUserRecord<TestSessionState, TestInitiationData> {
  return reconcileSesameDeviceSet<TestSessionState, TestInitiationData>(
    null,
    REMOTE_USER_ID,
    deviceIds.map((deviceId, index) => ({ deviceId, ...identity(index + 1) })),
    OPTIONS
  ).userRecord
}

function regularSession(sessionId: string, step: number): SesameSessionRecord<TestSessionState, TestInitiationData> {
  return {
    sessionId,
    phase: 'regular',
    state: { step },
    initiationData: null,
    createdAt: step,
    lastUsedAt: step,
  }
}

function replaceDevice(
  userRecord: SesameUserRecord<TestSessionState, TestInitiationData>,
  updatedDevice: SesameDeviceRecord<TestSessionState, TestInitiationData>
): SesameUserRecord<TestSessionState, TestInitiationData> {
  return {
    ...userRecord,
    devices: userRecord.devices.map((deviceRecord) => (deviceRecord.deviceId === updatedDevice.deviceId ? updatedDevice : deviceRecord)),
  }
}

function identity(seed: number): SesameDeviceIdentity {
  return {
    x25519PublicKey: new Uint8Array(32).fill(seed),
    ed25519PublicKey: new Uint8Array(32).fill(seed + 1),
  }
}

function encryptedMessage(sessionId: string, initiation: boolean, decryptable: boolean): TestEncryptedMessage {
  return { sessionId, initiation, decryptable, payload: bytes('message') }
}

function bytes(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value)
  const result = new Uint8Array(encoded.byteLength)
  result.set(encoded)
  return result
}
