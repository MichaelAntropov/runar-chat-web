import type { Contact } from '../../../contacts/types/Contact'

export interface Chat {
  id: string
  contact: Contact
  lastMessage: string | null
  lastMessageTime: number | null
  readReceiptsEnabled: boolean
  unreadCount: number

  autoScroll: boolean
  scrollPosition: number | null

  loadLatest: boolean
  messagesOffset: number
}
