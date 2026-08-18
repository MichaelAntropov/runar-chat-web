import type { WebsocketMessage } from '@/chat/types/message/WebsocketMessage'
import type { DeliveryReceiptResponse } from '@/chat/types/receipt/DeliveryReceiptResponse'
import type { PresenceUpdate } from '@/presence/types/PresenceUpdate'

export interface WsMessage<T extends string = string, P = unknown> {
  type: T
  payload: P
}

export type PresenceWsMessage = WsMessage<'PRESENCE', PresenceUpdate>

export type MessageWsMessage = WsMessage<'MESSAGE', WebsocketMessage>

export type DeliveryReceiptWsMessage = WsMessage<'DELIVERY_RECEIPT', DeliveryReceiptResponse>

export interface DeviceRemovedWsMessage {
  type: 'device_removed'
  userId: string
  deviceId: string
}
