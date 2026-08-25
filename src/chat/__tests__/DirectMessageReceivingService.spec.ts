import { describe, expect, it, vi } from 'vitest'

import { DirectMessageReceivingService } from '@/chat/DirectMessageReceivingService'
import type { InboundMessage } from '@/chat/types/message/InboundMessage'
import { DirectMessageSessionError } from '@/sesame/direct-message/directMessageErrors'
import type { DirectMessageDecryptionInput } from '@/sesame/direct-message/directMessageTypes'

describe('DirectMessageReceivingService', () => {
  it('maps an inbound transport message and returns authenticated plaintext', async () => {
    const plaintext = Uint8Array.from([21, 22])
    const decryptFromDevice = vi.fn(async (input: DirectMessageDecryptionInput) => {
      void input
      return {
        plaintext,
        sessionId: 'session-id',
        sessionCreated: true,
        deviceChange: null,
      }
    })
    const service = new DirectMessageReceivingService({ decryptFromDevice }, () => 1234)
    const message = inboundMessage()

    const result = await service.receive(message)

    expect(result).toBe(plaintext)
    expect(decryptFromDevice).toHaveBeenCalledWith({
      senderUserId: 'sender-user',
      senderDeviceId: 'sender-device',
      encryptedMessage: {
        receiverSignedPreKeyId: 'signed-pre-key',
        receiverOneTimePreKeyId: 'one-time-pre-key',
        senderEphemeralKey: Uint8Array.from([1, 2]),
        encryptedHeader: Uint8Array.from([3, 4]),
        cipherPayload: Uint8Array.from([5, 6]),
      },
      receivedAt: 1234,
    })
  })

  it('returns null when no Sesame session can authenticate the message', async () => {
    const decryptFromDevice = vi.fn(async (input: DirectMessageDecryptionInput) => {
      void input
      return null
    })
    const service = new DirectMessageReceivingService({ decryptFromDevice })

    await expect(service.receive(inboundMessage())).resolves.toBeNull()
  })

  it('rejects an inbound message without a Double Ratchet header', async () => {
    const decryptFromDevice = vi.fn(async (input: DirectMessageDecryptionInput) => {
      void input
      return null
    })
    const service = new DirectMessageReceivingService({ decryptFromDevice })

    await expect(service.receive({ ...inboundMessage(), encryptedHeader: null })).rejects.toBeInstanceOf(DirectMessageSessionError)
    expect(decryptFromDevice).not.toHaveBeenCalled()
  })
})

function inboundMessage(): InboundMessage {
  return {
    messageId: 'message-id',
    createdAt: '2026-08-25T20:00:00Z',
    senderId: 'sender-user',
    senderDeviceId: 'sender-device',
    signedPreKeyIdUsed: 'signed-pre-key',
    oneTimePreKeyIdUsed: 'one-time-pre-key',
    senderEphemeralKey: Uint8Array.from([1, 2]),
    encryptedHeader: Uint8Array.from([3, 4]),
    cipherPayload: Uint8Array.from([5, 6]),
  }
}
