import type { PendingReadReceipt } from '@/chat/types/receipt/PendingReadReceipt'
import { PENDING_READ_RECEIPTS_STORE } from '@/db/RunarDB'

import { useDbStore } from '../dbStore'

export class PendingReadReceiptRepository {
  private get db() {
    return useDbStore().db
  }

  async save(receipts: PendingReadReceipt[]): Promise<void> {
    if (receipts.length === 0) return
    await this.db[PENDING_READ_RECEIPTS_STORE].bulkPut(receipts)
  }

  async getAll(): Promise<PendingReadReceipt[]> {
    return this.db[PENDING_READ_RECEIPTS_STORE].toArray()
  }

  async deleteByMessageIds(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return
    await this.db[PENDING_READ_RECEIPTS_STORE].bulkDelete(messageIds)
  }

  async deleteByChatId(chatId: string): Promise<void> {
    const receiptIds = (await this.getAll())
      .filter((receipt) => receipt.chatId === chatId)
      .map((receipt) => receipt.messageId)
    await this.deleteByMessageIds(receiptIds)
  }

  async clear(): Promise<void> {
    await this.db[PENDING_READ_RECEIPTS_STORE].clear()
  }
}

export const pendingReadReceiptRepository = new PendingReadReceiptRepository()
