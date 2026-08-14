import type { EncodedMessage } from './Message'

export interface NoOpMessage extends EncodedMessage {
  type: 'NO_OP'
}
