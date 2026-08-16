import { parseUtcTimestamp } from '@/core/utils'

import type { DeliveryReceiptResponse } from './DeliveryReceiptResponse'

export interface DeliveryReceipt {
  messageId: string
  deliveredAt: number
}

export function deliveryReceiptFromResponse(
  response: DeliveryReceiptResponse,
): DeliveryReceipt {
  if (typeof response.messageId !== 'string' || typeof response.deliveredAt !== 'string') {
    throw new Error('Invalid delivery receipt payload')
  }

  const deliveredAt = parseUtcTimestamp(response.deliveredAt)
  if (!Number.isFinite(deliveredAt)) {
    throw new Error(`Invalid delivery receipt timestamp: ${response.deliveredAt}`)
  }

  return {
    messageId: response.messageId,
    deliveredAt,
  }
}
