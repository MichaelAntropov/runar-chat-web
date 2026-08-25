import { describe, expect, it, vi } from 'vitest'

import type { RunarDb } from '@/db/RunarDB'
import { SESAME_DEVICES_STORE, SESAME_SESSIONS_STORE, SESAME_USERS_STORE } from '@/db/RunarDB'
import type { SesameDevice, SesameSession, SesameUser } from '@/sesame/entities/sesameEntities'

import { SesameRepository } from '../SesameRepository'
import { SesameConcurrentModificationError } from '../types/sesameErrors'
import type { SesameUserRecord } from '../types/sesameTypes'

interface TestSessionState {
  counter: number
}

interface TestInitiationData {
  signedPreKeyId: string
}

describe('SesameRepository', () => {
  it('persists normalized rows and assembles a user projection', async () => {
    const fake = createFakeDb()
    const repository = new SesameRepository<TestSessionState, TestInitiationData>(fake.db)
    const record = createUserRecord()

    const saved = await repository.saveUserRecord(null, record)
    const loaded = await repository.loadUserRecord(record.userId)

    expect(saved.entityVersion).toBe(1)
    expect(loaded).toEqual({ entityVersion: 1, userRecord: record })
    expect(fake.users.size).toBe(1)
    expect(fake.devices.size).toBe(1)
    expect(fake.sessions.size).toBe(2)
  })

  it('writes only a changed session while advancing entityVersion', async () => {
    const fake = createFakeDb()
    const repository = new SesameRepository<TestSessionState, TestInitiationData>(fake.db)
    const saved = await repository.saveUserRecord(null, createUserRecord())
    const activeSession = saved.userRecord.devices[0].activeSession!
    const nextRecord: SesameUserRecord<TestSessionState, TestInitiationData> = {
      ...saved.userRecord,
      devices: [
        {
          ...saved.userRecord.devices[0],
          activeSession: {
            ...activeSession,
            state: { counter: 2 },
            lastUsedAt: 20,
          },
        },
      ],
    }
    fake.deviceTable.bulkPut.mockClear()
    fake.sessionTable.bulkPut.mockClear()

    const updated = await repository.saveUserRecord(saved, nextRecord)

    expect(updated.entityVersion).toBe(2)
    expect(fake.deviceTable.bulkPut).not.toHaveBeenCalled()
    expect(fake.sessionTable.bulkPut).toHaveBeenCalledOnce()
    expect(fake.sessionTable.bulkPut.mock.calls[0][0]).toHaveLength(1)
  })

  it('rejects a commit based on a stale entityVersion', async () => {
    const fake = createFakeDb()
    const repository = new SesameRepository<TestSessionState, TestInitiationData>(fake.db)
    const saved = await repository.saveUserRecord(null, createUserRecord())
    fake.users.get(saved.userRecord.userId)!.entityVersion = 2

    await expect(repository.saveUserRecord(saved, saved.userRecord)).rejects.toBeInstanceOf(SesameConcurrentModificationError)
  })

  it('deletes a complete normalized user projection atomically', async () => {
    const fake = createFakeDb()
    const repository = new SesameRepository<TestSessionState, TestInitiationData>(fake.db)
    const saved = await repository.saveUserRecord(null, createUserRecord())

    await repository.deleteUserRecord(saved)

    expect(fake.users.size).toBe(0)
    expect(fake.devices.size).toBe(0)
    expect(fake.sessions.size).toBe(0)
  })
})

function createUserRecord(): SesameUserRecord<TestSessionState, TestInitiationData> {
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
          sessionId: 'active-session',
          phase: 'regular',
          state: { counter: 1 },
          initiationData: null,
          createdAt: 1,
          lastUsedAt: 10,
        },
        inactiveSessions: [
          {
            sessionId: 'inactive-session',
            phase: 'initiating',
            state: { counter: 0 },
            initiationData: { signedPreKeyId: 'signed-pre-key' },
            createdAt: 1,
            lastUsedAt: 1,
          },
        ],
      },
    ],
  }
}

function createFakeDb() {
  const users = new Map<string, SesameUser>()
  const devices = new Map<string, SesameDevice>()
  const sessions = new Map<string, SesameSession>()
  const deviceKey = (userId: string, deviceId: string) => `${userId}:${deviceId}`

  const userTable = {
    delete: vi.fn(async (userId: string) => users.delete(userId)),
    get: vi.fn(async (userId: string) => users.get(userId)),
    put: vi.fn(async (user: SesameUser) => users.set(user.userId, user)),
  }
  const deviceTable = {
    bulkDelete: vi.fn(async (keys: [string, string][]) => {
      keys.forEach(([userId, deviceId]) => devices.delete(deviceKey(userId, deviceId)))
    }),
    bulkPut: vi.fn(async (rows: SesameDevice[]) => {
      rows.forEach((row) => devices.set(deviceKey(row.userId, row.deviceId), row))
    }),
    where: vi.fn(() => ({
      equals: (userId: string) => ({
        primaryKeys: async () =>
          [...devices.values()].filter((row) => row.userId === userId).map((row): [string, string] => [row.userId, row.deviceId]),
        toArray: async () => [...devices.values()].filter((row) => row.userId === userId),
      }),
    })),
  }
  const sessionTable = {
    bulkDelete: vi.fn(async (ids: string[]) => ids.forEach((id) => sessions.delete(id))),
    bulkPut: vi.fn(async (rows: SesameSession[]) => {
      rows.forEach((row) => sessions.set(row.sessionId, row))
    }),
    where: vi.fn(() => ({
      equals: (userId: string) => ({
        primaryKeys: async () => [...sessions.values()].filter((row) => row.userId === userId).map((row) => row.sessionId),
        toArray: async () => [...sessions.values()].filter((row) => row.userId === userId),
      }),
    })),
  }
  const transaction = vi.fn(async (...args: unknown[]) => {
    const operation = args.at(-1) as () => Promise<unknown>
    return operation()
  })
  const db = {
    [SESAME_USERS_STORE]: userTable,
    [SESAME_DEVICES_STORE]: deviceTable,
    [SESAME_SESSIONS_STORE]: sessionTable,
    transaction,
  } as unknown as RunarDb

  return {
    db,
    deviceTable,
    devices,
    sessions,
    sessionTable,
    transaction,
    users,
  }
}
