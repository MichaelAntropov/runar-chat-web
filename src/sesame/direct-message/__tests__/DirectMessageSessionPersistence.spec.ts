import { describe, expect, it, vi } from 'vitest'

import type { RunarDb } from '@/db/RunarDB'
import { LOCAL_ONE_TIME_PRE_KEYS_STORE, SESAME_DEVICES_STORE, SESAME_SESSIONS_STORE, SESAME_USERS_STORE } from '@/db/RunarDB'
import type { LocalOneTimePreKey } from '@/device/types/LocalOneTimePreKey'
import type { SesameDevice } from '@/sesame/entities/SesameDeviceEntity'
import type { SesameSession } from '@/sesame/entities/SesameSessionEntity'
import type { SesameUser } from '@/sesame/entities/SesameUserEntity'
import type { SesameUserRecord } from '@/sesame/types/sesameTypes'

import { DirectMessageSessionPersistence } from '../DirectMessageSessionPersistence'
import type { DirectMessageInitiationData } from '../types/DirectMessageInitiationData'
import { DirectMessageSessionError } from '../types/DirectMessageSessionError'
import type { DirectMessageSessionState } from '../types/DirectMessageSessionState'

const ONE_TIME_PRE_KEY_ID = 'one-time-pre-key'

describe('DirectMessageSessionPersistence', () => {
  it('commits the receiving session and consumes its one-time pre-key together', async () => {
    const fake = createFakeDb(true)
    const persistence = new DirectMessageSessionPersistence(fake.db)

    const saved = await persistence.saveReceivedUserRecord(null, receivingUserRecord(), ONE_TIME_PRE_KEY_ID)

    expect(saved.entityVersion).toBe(1)
    expect(fake.users.size).toBe(1)
    expect(fake.devices.size).toBe(1)
    expect(fake.sessions.size).toBe(1)
    expect(fake.oneTimePreKeys.has(ONE_TIME_PRE_KEY_ID)).toBe(false)
    expect(fake.transaction).toHaveBeenCalledOnce()
  })

  it('does not write Sesame state when the referenced one-time pre-key is unavailable', async () => {
    const fake = createFakeDb(false)
    const persistence = new DirectMessageSessionPersistence(fake.db)

    await expect(persistence.saveReceivedUserRecord(null, receivingUserRecord(), ONE_TIME_PRE_KEY_ID)).rejects.toBeInstanceOf(
      DirectMessageSessionError
    )

    expect(fake.users.size).toBe(0)
    expect(fake.devices.size).toBe(0)
    expect(fake.sessions.size).toBe(0)
  })
})

function receivingUserRecord(): SesameUserRecord<DirectMessageSessionState, DirectMessageInitiationData> {
  return {
    userId: 'remote-user',
    staleSince: null,
    devices: [
      {
        deviceId: 'remote-device',
        identity: {
          x25519PublicKey: new Uint8Array(32).fill(1),
          ed25519PublicKey: new Uint8Array(32).fill(2),
        },
        staleSince: null,
        activeSession: {
          sessionId: 'receiving-session',
          phase: 'regular',
          state: { step: 1 } as unknown as DirectMessageSessionState,
          initiationData: null,
          createdAt: 1,
          lastUsedAt: 1,
        },
        inactiveSessions: [],
      },
    ],
  }
}

function createFakeDb(includeOneTimePreKey: boolean) {
  const users = new Map<string, SesameUser>()
  const devices = new Map<string, SesameDevice>()
  const sessions = new Map<string, SesameSession>()
  const oneTimePreKeys = new Map<string, LocalOneTimePreKey>()
  if (includeOneTimePreKey) {
    oneTimePreKeys.set(ONE_TIME_PRE_KEY_ID, { id: ONE_TIME_PRE_KEY_ID } as LocalOneTimePreKey)
  }

  const userTable = {
    get: vi.fn(async (id: string) => users.get(id)),
    put: vi.fn(async (entity: SesameUser) => users.set(entity.userId, entity)),
  }
  const deviceTable = {
    bulkDelete: vi.fn(async (keys: [string, string][]) => {
      keys.forEach(([userId, deviceId]) => devices.delete(`${userId}:${deviceId}`))
    }),
    bulkPut: vi.fn(async (entities: SesameDevice[]) => {
      entities.forEach((entity) => devices.set(`${entity.userId}:${entity.deviceId}`, entity))
    }),
  }
  const sessionTable = {
    bulkDelete: vi.fn(async (ids: string[]) => ids.forEach((id) => sessions.delete(id))),
    bulkPut: vi.fn(async (entities: SesameSession[]) => {
      entities.forEach((entity) => sessions.set(entity.sessionId, entity))
    }),
  }
  const oneTimePreKeyTable = {
    delete: vi.fn(async (id: string) => oneTimePreKeys.delete(id)),
    get: vi.fn(async (id: string) => oneTimePreKeys.get(id)),
  }
  const transaction = vi.fn(async (...args: unknown[]) => {
    const operation = args.at(-1) as () => Promise<unknown>
    return operation()
  })
  const db = {
    [SESAME_USERS_STORE]: userTable,
    [SESAME_DEVICES_STORE]: deviceTable,
    [SESAME_SESSIONS_STORE]: sessionTable,
    [LOCAL_ONE_TIME_PRE_KEYS_STORE]: oneTimePreKeyTable,
    transaction,
  } as unknown as RunarDb

  return { db, devices, oneTimePreKeys, sessions, transaction, users }
}
