import type { ReadReceipt } from '@/chat/types/receipt/ReadReceipt'

import type { EncodedMessage } from './Message'

export interface ReadReceiptMessage extends EncodedMessage {
  type: 'READ_RECEIPT'
  receipts: ReadReceipt[]
}
