import { decryptSesameMessage, encryptSesameMessageForUser, ensureActiveSesameSessions } from '@/sesame/sesameMessageProcessing'
import { reconcileSesameDeviceSet } from '@/sesame/sesameState'
import type { SesameDeviceIdentityTuple, SesameUserRecord } from '@/sesame/types/sesameTypes'
import type { SesameUserProjection } from '@/sesame/types/sesameUserProjection'

import type { DirectMessageCoordinatorDependencies } from './types/DirectMessageCoordinatorDependencies'
import type { DirectMessageDecryptionInput } from './types/DirectMessageDecryptionInput'
import type { DirectMessageDecryptionResult } from './types/DirectMessageDecryptionResult'
import type { DirectMessageEncryptionResult } from './types/DirectMessageEncryptionResult'
import type { DirectMessageInitiationData } from './types/DirectMessageInitiationData'
import { DirectMessageSessionError } from './types/DirectMessageSessionError'
import type { DirectMessageSessionState } from './types/DirectMessageSessionState'

type Projection = SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData>
type UserRecord = SesameUserRecord<DirectMessageSessionState, DirectMessageInitiationData>

export class DirectMessageCoordinator {
  private readonly projections = new Map<string, Projection | null>()
  private readonly userOperations = new Map<string, Promise<void>>()
  private readonly now: () => number

  constructor(private readonly dependencies: DirectMessageCoordinatorDependencies) {
    this.now = dependencies.now ?? (() => Date.now())
  }

  encryptForUser(recipientUserId: string, plaintext: Uint8Array<ArrayBuffer>): Promise<DirectMessageEncryptionResult> {
    return this.runForUser(recipientUserId, async () => {
      const previous = await this.loadProjection(recipientUserId)
      const observedAt = this.now()
      const activeDevices = await this.dependencies.loadDeviceIdentities(recipientUserId)
      const reconciled = reconcileSesameDeviceSet(
        previous?.userRecord ?? null,
        recipientUserId,
        activeDevices,
        this.reconciliationOptions(observedAt)
      )
      const prepared = await ensureActiveSesameSessions(
        reconciled.userRecord,
        this.dependencies.sessionAdapter,
        observedAt,
        this.dependencies.limits.maxSessionsPerDevice
      )
      const encrypted = await encryptSesameMessageForUser(prepared, plaintext, this.dependencies.sessionAdapter, this.now())

      if (encrypted.deviceMessages.length === 0) {
        throw new DirectMessageSessionError('The recipient has no active messaging devices')
      }

      await this.saveUserRecord(recipientUserId, previous, encrypted.userRecord)
      return { deviceMessages: encrypted.deviceMessages }
    })
  }

  decryptFromDevice(input: DirectMessageDecryptionInput): Promise<DirectMessageDecryptionResult | null> {
    return this.runForUser(input.senderUserId, async () => {
      const previous = await this.loadProjection(input.senderUserId)
      const existingDevice = previous?.userRecord.devices.find((device) => device.deviceId === input.senderDeviceId)
      const initiationMessage = this.dependencies.sessionAdapter.isInitiationMessage(input.encryptedMessage)
      let currentUserRecord: UserRecord | null = previous?.userRecord ?? null
      let senderIdentity: SesameDeviceIdentityTuple | null = null

      if (initiationMessage) {
        const activeDevices = await this.dependencies.loadDeviceIdentities(input.senderUserId)
        senderIdentity = activeDevices.find((device) => device.deviceId === input.senderDeviceId) ?? null
        if (senderIdentity === null) return null

        currentUserRecord = reconcileSesameDeviceSet(
          currentUserRecord,
          input.senderUserId,
          activeDevices,
          this.reconciliationOptions(input.receivedAt)
        ).userRecord
      } else if (existingDevice === undefined) {
        return null
      }

      const decrypted = await decryptSesameMessage(
        currentUserRecord,
        {
          senderUserId: input.senderUserId,
          senderDeviceId: input.senderDeviceId,
          senderIdentity,
          encryptedMessage: input.encryptedMessage,
          processedAt: input.receivedAt,
        },
        this.dependencies.sessionAdapter,
        this.reconciliationOptions(input.receivedAt)
      )
      if (decrypted === null) return null

      const consumedOneTimePreKeyId = decrypted.sessionCreated ? input.encryptedMessage.receiverOneTimePreKeyId : null
      await this.saveReceivedUserRecord(input.senderUserId, previous, decrypted.userRecord, consumedOneTimePreKeyId)

      return {
        plaintext: decrypted.plaintext,
        sessionId: decrypted.sessionId,
        sessionCreated: decrypted.sessionCreated,
        deviceChange: decrypted.deviceChange,
      }
    })
  }

  clearCachedUser(userId: string): void {
    this.projections.delete(userId)
  }

  clearCache(): void {
    this.projections.clear()
  }

  private async loadProjection(userId: string): Promise<Projection | null> {
    if (this.projections.has(userId)) return this.projections.get(userId) ?? null

    const projection = await this.dependencies.persistence.loadUserRecord(userId)
    this.projections.set(userId, projection)
    return projection
  }

  private async saveUserRecord(userId: string, previous: Projection | null, nextUserRecord: UserRecord): Promise<void> {
    try {
      const saved = await this.dependencies.persistence.saveUserRecord(previous, nextUserRecord)
      this.projections.set(userId, saved)
    } catch (error: unknown) {
      this.projections.delete(userId)
      throw error
    }
  }

  private async saveReceivedUserRecord(
    userId: string,
    previous: Projection | null,
    nextUserRecord: UserRecord,
    consumedOneTimePreKeyId: string | null
  ): Promise<void> {
    try {
      const saved = await this.dependencies.persistence.saveReceivedUserRecord(previous, nextUserRecord, consumedOneTimePreKeyId)
      this.projections.set(userId, saved)
    } catch (error: unknown) {
      this.projections.delete(userId)
      throw error
    }
  }

  private reconciliationOptions(observedAt: number) {
    return {
      localAddress: this.dependencies.localAddress,
      observedAt,
      limits: this.dependencies.limits,
    }
  }

  private runForUser<Result>(userId: string, operation: () => Promise<Result>): Promise<Result> {
    const previousOperation = this.userOperations.get(userId) ?? Promise.resolve()
    const result = previousOperation.then(operation, operation)
    const tail = result.then(
      () => undefined,
      () => undefined
    )
    this.userOperations.set(userId, tail)
    void tail.finally(() => {
      if (this.userOperations.get(userId) === tail) this.userOperations.delete(userId)
    })
    return result
  }
}
