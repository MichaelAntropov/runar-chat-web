import { describe, expect, it, vi } from 'vitest'

import type { DoubleRatchetCipherText, EncodedDoubleRatchetHeader } from '@/crypto/double-ratchet/doubleRatchetTypes'
import type {
  SesameCreatedInitiatingSession,
  SesameCreatedReceivingSession,
  SesameRemoteDevice,
  SesameSessionAdapter,
  SesameSessionDecryptionResult,
  SesameSessionEncryptionResult,
} from '@/sesame/types/sesameSessionAdapter'
import type { SesameSessionRecord, SesameUserRecord } from '@/sesame/types/sesameTypes'
import type { SesameUserProjection } from '@/sesame/types/sesameUserProjection'

import { DirectMessageCoordinator } from '../DirectMessageCoordinator'
import type { DirectMessageEncryptedMessage } from '../types/DirectMessageEncryptedMessage'
import type { DirectMessageInitiationData } from '../types/DirectMessageInitiationData'
import type { DirectMessagePersistence } from '../types/DirectMessagePersistence'
import { DirectMessageSessionError } from '../types/DirectMessageSessionError'
import type { DirectMessageSessionState } from '../types/DirectMessageSessionState'

const LOCAL_USER_ID = 'local-user'
const LOCAL_DEVICE_ID = 'local-device'
const REMOTE_USER_ID = 'remote-user'
const REMOTE_DEVICE_ID = 'remote-device'
const SIGNED_PRE_KEY_ID = 'signed-pre-key'
const ONE_TIME_PRE_KEY_ID = 'one-time-pre-key'

describe('DirectMessageCoordinator', () => {
  it('serializes sends per user and caches the committed projection', async () => {
    const persistence = new TestPersistence()
    const adapter = new TestAdapter()
    const coordinator = createCoordinator(persistence, adapter)

    const [first, second] = await Promise.all([
      coordinator.encryptForUser(REMOTE_USER_ID, bytes('first')),
      coordinator.encryptForUser(REMOTE_USER_ID, bytes('second')),
    ])

    expect(first.deviceMessages).toHaveLength(1)
    expect(second.deviceMessages).toHaveLength(1)
    expect(persistence.loadUserRecord).toHaveBeenCalledOnce()
    expect(persistence.savedVersions).toEqual([1, 2])
    expect(sessionStep(persistence.current!.userRecord.devices[0].activeSession!.state)).toBe(2)
  })

  it('atomically requests one-time pre-key consumption for a new receiving session', async () => {
    const persistence = new TestPersistence()
    const adapter = new TestAdapter()
    const coordinator = createCoordinator(persistence, adapter)

    const result = await coordinator.decryptFromDevice({
      senderUserId: REMOTE_USER_ID,
      senderDeviceId: REMOTE_DEVICE_ID,
      encryptedMessage: encryptedMessage(true),
      receivedAt: 20,
    })

    expect(result).toMatchObject({ sessionCreated: true, sessionId: 'received-session' })
    expect(decodeText(result!.plaintext)).toBe('incoming')
    expect(persistence.receivedOneTimePreKeyIds).toEqual([ONE_TIME_PRE_KEY_ID])
  })

  it('does not consume a one-time pre-key when an existing session decrypts repeated initiation metadata', async () => {
    const persistence = new TestPersistence(existingProjection())
    const adapter = new TestAdapter()
    const coordinator = createCoordinator(persistence, adapter)

    const result = await coordinator.decryptFromDevice({
      senderUserId: REMOTE_USER_ID,
      senderDeviceId: REMOTE_DEVICE_ID,
      encryptedMessage: encryptedMessage(true),
      receivedAt: 20,
    })

    expect(result?.sessionCreated).toBe(false)
    expect(persistence.receivedOneTimePreKeyIds).toEqual([null])
    expect(adapter.createdReceivingSessionCount).toBe(0)
  })

  it('does not persist a send when the recipient has no active devices', async () => {
    const persistence = new TestPersistence()
    const coordinator = createCoordinator(persistence, new TestAdapter(), [])

    await expect(coordinator.encryptForUser(REMOTE_USER_ID, bytes('hello'))).rejects.toThrow(DirectMessageSessionError)
    expect(persistence.saveUserRecord).not.toHaveBeenCalled()
  })
})

class TestPersistence implements DirectMessagePersistence {
  current: Projection | null
  readonly savedVersions: number[] = []
  readonly receivedOneTimePreKeyIds: Array<string | null> = []

  readonly loadUserRecord = vi.fn(async () => this.current)
  readonly saveUserRecord = vi.fn(async (previous: Projection | null, next: UserRecord) => this.commit(previous, next))
  readonly saveReceivedUserRecord = vi.fn(async (previous: Projection | null, next: UserRecord, oneTimePreKeyId: string | null) => {
    this.receivedOneTimePreKeyIds.push(oneTimePreKeyId)
    return this.commit(previous, next)
  })

  constructor(initial: Projection | null = null) {
    this.current = initial
  }

  private commit(previous: Projection | null, next: UserRecord): Projection {
    if (previous !== this.current) throw new Error('Concurrent test commit')
    const entityVersion = (previous?.entityVersion ?? 0) + 1
    this.current = { entityVersion, userRecord: next }
    this.savedVersions.push(entityVersion)
    return this.current
  }
}

class TestAdapter implements SesameSessionAdapter<DirectMessageSessionState, DirectMessageInitiationData, DirectMessageEncryptedMessage> {
  createdReceivingSessionCount = 0
  private createdInitiatingSessionCount = 0

  async createInitiatingSession(): Promise<SesameCreatedInitiatingSession<DirectMessageSessionState, DirectMessageInitiationData>> {
    this.createdInitiatingSessionCount += 1
    return {
      sessionId: `initiating-${this.createdInitiatingSessionCount}`,
      state: sessionState(0),
      initiationData: {
        receiverSignedPreKeyId: SIGNED_PRE_KEY_ID,
        receiverOneTimePreKeyId: ONE_TIME_PRE_KEY_ID,
        senderEphemeralKey: new Uint8Array(32),
      },
    }
  }

  async createReceivingSession(): Promise<SesameCreatedReceivingSession<DirectMessageSessionState>> {
    this.createdReceivingSessionCount += 1
    return { sessionId: 'received-session', state: sessionState(0) }
  }

  async encrypt(
    _remoteDevice: SesameRemoteDevice,
    session: SessionRecord,
    plaintext: Uint8Array<ArrayBuffer>
  ): Promise<SesameSessionEncryptionResult<DirectMessageSessionState, DirectMessageEncryptedMessage>> {
    return {
      encryptedMessage: {
        receiverSignedPreKeyId: session.initiationData?.receiverSignedPreKeyId ?? null,
        receiverOneTimePreKeyId: session.initiationData?.receiverOneTimePreKeyId ?? null,
        senderEphemeralKey: session.initiationData?.senderEphemeralKey ?? null,
        encryptedHeader: new Uint8Array() as EncodedDoubleRatchetHeader,
        cipherPayload: plaintext.slice() as DoubleRatchetCipherText,
      },
      nextSessionState: sessionState(sessionStep(session.state) + 1),
    }
  }

  async tryDecrypt(_remoteDevice: SesameRemoteDevice, session: SessionRecord): Promise<SesameSessionDecryptionResult<DirectMessageSessionState>> {
    return {
      plaintext: bytes('incoming'),
      nextSessionState: sessionState(sessionStep(session.state) + 1),
    }
  }

  isInitiationMessage(message: DirectMessageEncryptedMessage): boolean {
    return message.receiverSignedPreKeyId !== null
  }
}

function createCoordinator(persistence: DirectMessagePersistence, adapter: TestAdapter, devices = [deviceIdentity()]): DirectMessageCoordinator {
  let timestamp = 10
  return new DirectMessageCoordinator({
    persistence,
    sessionAdapter: adapter,
    loadDeviceIdentities: async () => devices,
    localAddress: { userId: LOCAL_USER_ID, deviceId: LOCAL_DEVICE_ID },
    limits: { maxDevicesPerUser: 5, maxSessionsPerDevice: 5 },
    now: () => timestamp++,
  })
}

function existingProjection(): Projection {
  return {
    entityVersion: 1,
    userRecord: {
      userId: REMOTE_USER_ID,
      staleSince: null,
      devices: [
        {
          ...deviceIdentity(),
          identity: {
            x25519PublicKey: deviceIdentity().x25519PublicKey,
            ed25519PublicKey: deviceIdentity().ed25519PublicKey,
          },
          staleSince: null,
          activeSession: {
            sessionId: 'existing-session',
            phase: 'regular',
            state: sessionState(2),
            initiationData: null,
            createdAt: 1,
            lastUsedAt: 2,
          },
          inactiveSessions: [],
        },
      ],
    },
  }
}

function deviceIdentity() {
  return {
    deviceId: REMOTE_DEVICE_ID,
    x25519PublicKey: new Uint8Array(32).fill(1),
    ed25519PublicKey: new Uint8Array(32).fill(2),
  }
}

function encryptedMessage(initiation: boolean): DirectMessageEncryptedMessage {
  return {
    receiverSignedPreKeyId: initiation ? SIGNED_PRE_KEY_ID : null,
    receiverOneTimePreKeyId: initiation ? ONE_TIME_PRE_KEY_ID : null,
    senderEphemeralKey: initiation ? new Uint8Array(32) : null,
    encryptedHeader: new Uint8Array() as EncodedDoubleRatchetHeader,
    cipherPayload: bytes('ciphertext') as DoubleRatchetCipherText,
  }
}

function sessionState(step: number): DirectMessageSessionState {
  return { step } as unknown as DirectMessageSessionState
}

function sessionStep(state: DirectMessageSessionState): number {
  return (state as unknown as { step: number }).step
}

function bytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(new TextEncoder().encode(value))
}

function decodeText(value: Uint8Array<ArrayBuffer>): string {
  return new TextDecoder().decode(value)
}

type Projection = SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData>
type UserRecord = SesameUserRecord<DirectMessageSessionState, DirectMessageInitiationData>
type SessionRecord = SesameSessionRecord<DirectMessageSessionState, DirectMessageInitiationData>
