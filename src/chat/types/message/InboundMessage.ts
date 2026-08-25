import { base64ToUint8Array } from '@/core/utils'
import type { WebsocketMessage } from './WebsocketMessage'

export interface InboundMessage {
  messageId: string
  createdAt: string

  senderId: string
  senderDeviceId: string

  signedPreKeyIdUsed: string | null
  oneTimePreKeyIdUsed: string | null

  senderEphemeralKey: Uint8Array<ArrayBuffer> | null
  encryptedHeader: Uint8Array<ArrayBuffer> | null

  cipherPayload: Uint8Array<ArrayBuffer>
}

export function inboundMessageFromWebsocketMessage(
  websocketMessage: WebsocketMessage,
): InboundMessage {
  return {
    messageId: websocketMessage.messageId,
    createdAt: websocketMessage.createdAt,

    senderId: websocketMessage.senderId,
    senderDeviceId: websocketMessage.senderDeviceId,

    signedPreKeyIdUsed: websocketMessage.signedPreKeyIdUsed,
    oneTimePreKeyIdUsed: websocketMessage.oneTimePreKeyIdUsed,

    senderEphemeralKey: websocketMessage.senderEphemeralKey
      ? base64ToUint8Array(websocketMessage.senderEphemeralKey)
      : null,
    cipherPayload: base64ToUint8Array(websocketMessage.cipherPayload),
    encryptedHeader: websocketMessage.encryptedHeader
      ? base64ToUint8Array(websocketMessage.encryptedHeader)
      : null,
  }
}
