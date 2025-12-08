import type { EncodedMessage } from './Message'

export interface TextMessage extends EncodedMessage {
  type: 'TEXT'
  content: string
}
