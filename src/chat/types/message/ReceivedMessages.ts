import type { DeliveryReceipt } from '@/chat/types/receipt/DeliveryReceipt'

import type { OfflineMessage } from './OfflineMessage'

export interface ReceivedMessages {
  messages: OfflineMessage[]
  deliveryReceipts: DeliveryReceipt[]
}
