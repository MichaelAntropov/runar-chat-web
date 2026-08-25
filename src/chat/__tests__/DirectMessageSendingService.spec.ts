import { describe, expect, it, vi } from 'vitest'

import { DirectMessageSendingService } from '@/chat/DirectMessageSendingService'
import { DeviceSetMismatchError } from '@/chat/types/message/DeviceSetMismatchError'
import type { MessagePayload } from '@/chat/types/message/MessagePayload'
import type { SendMessageResponse } from '@/chat/types/message/SendMessageResponse'
import type { DoubleRatchetCipherText, EncodedDoubleRatchetHeader } from '@/crypto/double-ratchet/doubleRatchetTypes'
import type { DirectMessageEncryptedMessage, DirectMessageEncryptionOptions } from '@/sesame/direct-message/directMessageTypes'
import type { SesameEncryptedDeviceMessage } from '@/sesame/types/sesameTypes'

const RECIPIENT_USER_ID = 'recipient-user'
const LOCAL_USER_ID = 'local-user'

describe('DirectMessageSendingService', () => {
  it('combines recipient and linked local-device messages in one API payload', async () => {
    const coordinator = createCoordinator({
      [RECIPIENT_USER_ID]: [encryptedDeviceMessage('recipient-device', 1)],
      [LOCAL_USER_ID]: [encryptedDeviceMessage('linked-local-device', 2)],
    })
    const response = sendResponse()
    const sendPayload = vi.fn<(payload: MessagePayload) => Promise<SendMessageResponse>>(async () => response)
    const service = new DirectMessageSendingService(coordinator, sendPayload)

    const result = await service.send(RECIPIENT_USER_ID, LOCAL_USER_ID, Uint8Array.from([9]))

    expect(result).toBe(response)
    expect(sendPayload).toHaveBeenCalledOnce()
    expect(sendPayload.mock.calls[0][0]).toEqual({
      deviceMessages: [
        {
          receiverUserId: RECIPIENT_USER_ID,
          receiverDeviceId: 'recipient-device',
          receiverSignedPreKeyId: 'signed-pre-key',
          receiverOneTimePreKeyId: 'one-time-pre-key',
          senderEphemeralKey: 'AQE=',
          cipherPayload: 'AQ==',
          encryptedHeader: 'Ag==',
        },
        {
          receiverUserId: LOCAL_USER_ID,
          receiverDeviceId: 'linked-local-device',
          receiverSignedPreKeyId: 'signed-pre-key',
          receiverOneTimePreKeyId: 'one-time-pre-key',
          senderEphemeralKey: 'AgI=',
          cipherPayload: 'Ag==',
          encryptedHeader: 'Aw==',
        },
      ],
    })
  })

  it('returns a local-only result for Saved Messages with no linked devices', async () => {
    const coordinator = createCoordinator({ [LOCAL_USER_ID]: [] })
    const sendPayload = vi.fn(async () => sendResponse())
    const service = new DirectMessageSendingService(coordinator, sendPayload)

    const result = await service.send(LOCAL_USER_ID, LOCAL_USER_ID, Uint8Array.from([1]))

    expect(result).toBeNull()
    expect(sendPayload).not.toHaveBeenCalled()
    expect(coordinator.encryptForUser).toHaveBeenCalledWith(LOCAL_USER_ID, Uint8Array.from([1]), { allowEmptyDeviceSet: true })
  })

  it('can send a no-op plaintext to linked local devices', async () => {
    const coordinator = createCoordinator({
      [RECIPIENT_USER_ID]: [encryptedDeviceMessage('recipient-device', 1)],
      [LOCAL_USER_ID]: [encryptedDeviceMessage('linked-local-device', 2)],
    })
    const service = new DirectMessageSendingService(
      coordinator,
      vi.fn(async () => sendResponse())
    )
    const receiptPlaintext = Uint8Array.from([1])
    const localNoOpPlaintext = Uint8Array.from([2])

    await service.sendWithLocalDeviceCopy(RECIPIENT_USER_ID, LOCAL_USER_ID, receiptPlaintext, localNoOpPlaintext)

    expect(coordinator.encryptForUser).toHaveBeenNthCalledWith(1, RECIPIENT_USER_ID, receiptPlaintext, { allowEmptyDeviceSet: false })
    expect(coordinator.encryptForUser).toHaveBeenNthCalledWith(2, LOCAL_USER_ID, localNoOpPlaintext, { allowEmptyDeviceSet: true })
  })

  it('invalidates affected projections and re-encrypts after a device-set mismatch', async () => {
    const coordinator = createCoordinator({
      [RECIPIENT_USER_ID]: [encryptedDeviceMessage('recipient-device', 1)],
      [LOCAL_USER_ID]: [],
    })
    const sendPayload = vi
      .fn()
      .mockRejectedValueOnce(new DeviceSetMismatchError({ [RECIPIENT_USER_ID]: ['new-device'] }, {}))
      .mockResolvedValueOnce(sendResponse())
    const service = new DirectMessageSendingService(coordinator, sendPayload)

    await service.send(RECIPIENT_USER_ID, LOCAL_USER_ID, Uint8Array.from([1]))

    expect(sendPayload).toHaveBeenCalledTimes(2)
    expect(coordinator.encryptForUser).toHaveBeenCalledTimes(4)
    expect(coordinator.clearCachedUser).toHaveBeenCalledWith(RECIPIENT_USER_ID)
    expect(coordinator.clearCachedUser).toHaveBeenCalledWith(LOCAL_USER_ID)
  })
})

function createCoordinator(messagesByUser: Record<string, EncryptedDeviceMessage[]>) {
  return {
    clearCachedUser: vi.fn(),
    encryptForUser: vi.fn(async (userId: string, plaintext: Uint8Array<ArrayBuffer>, options?: DirectMessageEncryptionOptions) => {
      void plaintext
      void options
      return { deviceMessages: messagesByUser[userId] ?? [] }
    }),
  }
}

function encryptedDeviceMessage(deviceId: string, value: number): EncryptedDeviceMessage {
  return {
    deviceId,
    sessionId: `session-${deviceId}`,
    encryptedMessage: {
      receiverSignedPreKeyId: 'signed-pre-key',
      receiverOneTimePreKeyId: 'one-time-pre-key',
      senderEphemeralKey: Uint8Array.from([value, value]),
      cipherPayload: Uint8Array.from([value]) as DoubleRatchetCipherText,
      encryptedHeader: Uint8Array.from([value + 1]) as EncodedDoubleRatchetHeader,
    },
  }
}

function sendResponse(): SendMessageResponse {
  return { messageId: 'message-id', createdAt: '2026-08-25T20:00:00Z' }
}

type EncryptedDeviceMessage = SesameEncryptedDeviceMessage<DirectMessageEncryptedMessage>
