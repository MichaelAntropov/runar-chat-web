import type { Contact } from '../../../contacts/types/Contact'

export interface Chat {
  id: string
  contact: Contact
  lastMessage: string | null
  lastMessageTime?: Date | null

  autoScroll: boolean
  scrollPosition: number | null

  loadLatest: boolean
  messagesOffset: number
}
