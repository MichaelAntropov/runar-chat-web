import type { WebsocketMessage } from '@/chat/types/message/WebsocketMessage'
import type { PresenceUpdate } from '@/presence/types/PresenceUpdate'

export interface WsMessage<T extends string = string, P = unknown> {
  type: T
  payload: P
}

export type PresenceWsMessage = WsMessage<'PRESENCE', PresenceUpdate>

export type MessageWsMessage = WsMessage<'MESSAGE', WebsocketMessage>
