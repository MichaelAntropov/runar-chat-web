import { debounce } from 'lodash'
import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'

import { useContactsStore } from '@/contacts/contactStore'
import { useDbStore } from '@/db/dbStore'
import { messageRepository } from '@/db/repositories/MessageRepository'
import { CHATS_STORE, CHATS_STORE_KEY } from '@/db/RunarDB'
import { useUserStore } from '@/user/userStore'

import type { Contact } from '../contacts/types/Contact'

import type { Chat } from './types/chat/Chat'
import type { StoredMessage } from './types/chat/StoredMessage'
import type { DeliveryReceipt } from './types/receipt/DeliveryReceipt'
import type { ReadReceipt } from './types/receipt/ReadReceipt'

export const MESSAGE_LOAD_COUNT = 15
export const MESSAGE_LOAD_STEP = 5
const MAX_PENDING_DELIVERY_RECEIPTS = 1000

interface PersistedChatState {
  chats?: Chat[]
  currentChatId?: string | null
  currentChat?: { id: string } | null
}

export const useChatsStore = defineStore('chats', () => {
  const dbStore = useDbStore()
  const contactsStore = useContactsStore()
  const userStore = useUserStore()

  const chats: Ref<Array<Chat>> = ref([])
  const currentChat: Ref<Chat | null> = ref(null)

  const currentChatMessages: Ref<Array<StoredMessage>> = ref([])
  const pendingDeliveryReceipts = new Map<string, DeliveryReceipt>()
  let deliveryReceiptQueue: Promise<void> = Promise.resolve()

  function enqueueDeliveryReceiptOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = deliveryReceiptQueue.then(operation, operation)
    deliveryReceiptQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async function loadMessagesFromDB() {
    const chat = currentChat.value
    if (!chat) {
      console.log('loadMessagesFromDB() - No chat selected!')
      return
    }

    if (chat.loadLatest) {
      console.log('loadMessagesFromDB() - Load latest messages')
      const size: number = MESSAGE_LOAD_COUNT + 2 * MESSAGE_LOAD_STEP
      const storedMessages: StoredMessage[] = await messageRepository.getLatestByChatId(
        chat.id,
        size,
      )
      const totalMsgCount: number = await messageRepository.countByChatId(chat.id)

      if (currentChat.value?.id !== chat.id) return

      currentChatMessages.value = storedMessages.reverse()

      if (totalMsgCount > MESSAGE_LOAD_COUNT + 2 * MESSAGE_LOAD_STEP) {
        chat.messagesOffset = -1
      }
    } else {
      console.log('loadMessagesFromDB() - Load offset messages')
      const sizeToLoad = MESSAGE_LOAD_COUNT + 2 * MESSAGE_LOAD_STEP
      const storedMessages = await messageRepository.getByChatIdOrderByCratedAtAsc(
        chat.id,
        chat.messagesOffset,
        sizeToLoad,
      )

      if (currentChat.value?.id !== chat.id) return

      currentChatMessages.value = storedMessages
    }
  }

  async function loadPreviousMessages() {
    console.log('Load previous messages...')
    const chat = currentChat.value
    if (!chat) {
      console.log('loadPreviousMessages() -  No chat selected!')
      return
    }

    const totalMsgCount = await messageRepository.countByChatId(chat.id)
    const currentLength = currentChatMessages.value.length

    if (totalMsgCount <= currentLength) {
      console.log('loadPreviousMessages() - Nothing to load: totalMsgCount <= currentLength')
      return
    }

    let offset
    if (chat.loadLatest) {
      console.log('loadPreviousMessages() - Load previous from "latest"')
      offset = totalMsgCount - (currentLength + MESSAGE_LOAD_STEP)
    } else {
      console.log('loadPreviousMessages() - Load another previous batch')
      offset = chat.messagesOffset - MESSAGE_LOAD_STEP
    }

    if (offset < 0) {
      offset = 0
    }

    const sizeToLoad = MESSAGE_LOAD_COUNT + 2 * MESSAGE_LOAD_STEP
    const storedMessages = await messageRepository.getByChatIdOrderByCratedAtAsc(
      chat.id,
      offset,
      sizeToLoad,
    )

    if (currentChat.value?.id !== chat.id) return

    chat.loadLatest = false
    chat.messagesOffset = offset
    currentChatMessages.value = storedMessages

    console.log(`currentChatMessages count: ${storedMessages.length}`)
    console.log('Previous messages loaded!')
  }

  async function loadNextMessages() {
    console.log('Load next messages...')
    const chat = currentChat.value
    if (!chat) {
      console.log('loadNextMessages() -  No chat selected!')
      return
    }

    const totalMsgCount = await messageRepository.countByChatId(chat.id)
    const currentLength = currentChatMessages.value.length

    if (totalMsgCount <= currentLength) {
      console.log('loadNextMessages() - Nothing to load: totalMsgCount <= currentLength')
      return
    }

    if (chat.loadLatest) {
      console.log('loadNextMessages() - Nothing to load: loadLatest === true')
      return
    }

    const offset = chat.messagesOffset + MESSAGE_LOAD_STEP
    const sizeToLoad = MESSAGE_LOAD_COUNT + 2 * MESSAGE_LOAD_STEP
    const storedMessages = await messageRepository.getByChatIdOrderByCratedAtAsc(
      chat.id,
      offset,
      sizeToLoad,
    )

    if (currentChat.value?.id !== chat.id) return

    chat.messagesOffset = offset
    currentChatMessages.value = storedMessages

    if (offset + currentChatMessages.value.length >= totalMsgCount) {
      chat.messagesOffset = -1
      chat.loadLatest = true
    }

    console.log(`currentChatMessages count: ${storedMessages.length}`)
    console.log('Next messages loaded!')
  }

  async function markVisibleMessagesAsRead(
    chat: Chat,
    messageIds: string[],
  ): Promise<ReadReceipt[]> {
    if (chat.contact.userId === userStore.principal?.id || messageIds.length === 0) return []

    try {
      const readAt = Date.now()
      const updatedMessages = await messageRepository.markMessagesAsRead(
        chat.id,
        chat.contact.userId,
        messageIds,
        readAt,
      )
      const readMessageIdSet = new Set(updatedMessages.map((message) => message.id))

      for (const message of currentChatMessages.value) {
        if (readMessageIdSet.has(message.id)) {
          message.readAt = readAt
        }
      }

      chat.unreadCount = Math.max(0, chat.unreadCount - updatedMessages.length)
      return updatedMessages.map((message) => ({ messageId: message.id, readAt }))
    } catch (error) {
      console.error(`Could not mark visible messages in chat id=${chat.id} as read:`, error)
      return []
    }
  }

  async function applyReadReceipts(chat: Chat, receipts: ReadReceipt[]): Promise<void> {
    const principalId = userStore.principal?.id
    if (!principalId || chat.contact.userId === principalId || receipts.length === 0) return

    const updatedMessages = await messageRepository.applyReadReceipts(
      chat.id,
      principalId,
      chat.contact.userId,
      receipts,
    )
    const updatedById = new Map(updatedMessages.map((message) => [message.id, message.readAt]))

    for (const message of currentChatMessages.value) {
      const readAt = updatedById.get(message.id)
      if (readAt !== undefined) {
        message.readAt = readAt
      }
    }
  }

  function bufferDeliveryReceipt(receipt: DeliveryReceipt): void {
    const existing = pendingDeliveryReceipts.get(receipt.messageId)
    if (existing && existing.deliveredAt <= receipt.deliveredAt) return

    if (!existing && pendingDeliveryReceipts.size >= MAX_PENDING_DELIVERY_RECEIPTS) {
      const oldestMessageId = pendingDeliveryReceipts.keys().next().value
      if (oldestMessageId) pendingDeliveryReceipts.delete(oldestMessageId)
    }

    pendingDeliveryReceipts.set(receipt.messageId, receipt)
  }

  async function applyDeliveryReceipts(receipts: DeliveryReceipt[]): Promise<void> {
    if (receipts.length === 0) return

    return enqueueDeliveryReceiptOperation(async () => {
      const principalId = userStore.principal?.id
      if (!principalId) return

      const { updatedMessages, unresolvedReceipts } =
        await messageRepository.applyDeliveryReceipts(principalId, receipts)

      for (const receipt of unresolvedReceipts) {
        bufferDeliveryReceipt(receipt)
      }

      const deliveredAtById = new Map(
        updatedMessages.map((message) => [message.id, message.deliveredAt]),
      )
      for (const message of currentChatMessages.value) {
        const deliveredAt = deliveredAtById.get(message.id)
        if (deliveredAt !== undefined) {
          message.deliveredAt = deliveredAt
        }
      }
    })
  }

  async function applyPendingDeliveryReceipt(message: StoredMessage): Promise<void> {
    const principalId = userStore.principal?.id
    const receipt = pendingDeliveryReceipts.get(message.id)
    if (!principalId || !receipt) return

    return enqueueDeliveryReceiptOperation(async () => {
      try {
        const { updatedMessages, unresolvedReceipts } =
          await messageRepository.applyDeliveryReceipts(principalId, [receipt])
        if (unresolvedReceipts.length === 0) {
          pendingDeliveryReceipts.delete(message.id)
        }

        const updatedMessage = updatedMessages.find((candidate) => candidate.id === message.id)
        if (updatedMessage) {
          message.deliveredAt = updatedMessage.deliveredAt
        }
      } catch (error) {
        console.error(
          `Could not apply pending delivery receipt for message id=${message.id}:`,
          error,
        )
      }
    })
  }

  async function addMessageToChat(chat: Chat, message: StoredMessage): Promise<void> {
    try {
      const isSelfMessage = message.senderId === message.recipientId
      if (isSelfMessage && message.readAt === null) {
        message.readAt = message.createdAt
      }

      await messageRepository.saveMessage(message)
      await applyPendingDeliveryReceipt(message)

      chat.lastMessage = message.content
      chat.lastMessageTime = message.createdAt

      const isCurrentChat = chat.id === currentChat.value?.id
      const isIncoming = !isSelfMessage && message.senderId === chat.contact.userId

      if (isCurrentChat && chat.autoScroll) {
        currentChatMessages.value.push(message)
      }

      if (isIncoming) {
        chat.unreadCount++
      }

      console.log(`Message added id=${message.id} to chat with id=${chat.id}`)
    } catch (error) {
      console.log(`Could not add message to chat: ${error}`)
    }
  }

  function createNewChatFromContact(contact: Contact): Chat {
    const existingChat = chats.value.find((chat) => chat.contact.userId === contact.userId)
    if (existingChat) {
      // Focus on existing chat
      return existingChat
    }

    const newChat: Chat = {
      id: contact.userId,
      contact: contact,
      lastMessage: null,
      lastMessageTime: null,
      unreadCount: 0,
      autoScroll: true,
      scrollPosition: null,
      messagesOffset: 0,
      loadLatest: true,
    }

    chats.value.push(newChat)
    return chats.value[chats.value.length - 1]
  }

  function changeCurrentChat(chatId: string) {
    const chat = chats.value.find((chat) => chat.id === chatId)
    if (chat) {
      currentChatMessages.value = []
      currentChat.value = chat
    } else {
      console.error(`Error: Could not find chat: ${chatId}`)
    }
  }

  function closeCurrentChat() {
    currentChatMessages.value = []
    currentChat.value = null
  }

  const isHydrated = ref(false)
  let hydratePromise: Promise<void> | null = null

  async function hydrate(): Promise<void> {
    if (hydratePromise) return hydratePromise
    hydratePromise = hydrateInternal().finally(() => {
      hydratePromise = null
    })
    return hydratePromise
  }

  async function hydrateInternal(): Promise<void> {
    if (!dbStore.db) return

    try {
      console.log('[chatStore] Hydrating from DB...')

      const record = (await dbStore.db.table(CHATS_STORE).get(CHATS_STORE_KEY)) as
        | PersistedChatState
        | undefined

      if (record) {
        const restoredChats: Chat[] = record.chats ?? []

        // Restore references (e.g. re-link contacts)
        for (const chat of restoredChats) {
          const [latestMessage] = await messageRepository.getLatestByChatId(chat.id, 1)
          chat.lastMessage = latestMessage?.content ?? null
          chat.lastMessageTime = latestMessage?.createdAt ?? null
          chat.unreadCount =
            chat.contact.userId === userStore.principal?.id
              ? 0
              : await messageRepository.countUnreadByChatId(chat.id, chat.contact.userId)

          const contactUserId = chat.contact.userId
          const contactRef = contactsStore.contacts.find((c) => c.userId === contactUserId)
          if (contactRef) {
            chat.contact = contactRef
          }
        }

        chats.value = restoredChats

        const persistedCurrentChatId = Object.prototype.hasOwnProperty.call(record, 'currentChatId')
          ? record.currentChatId
          : record.currentChat?.id

        currentChat.value = chats.value.find((chat) => chat.id === persistedCurrentChatId) ?? null
      }
    } catch (e) {
      console.error('[chatStore] Hydration failed:', e)
    } finally {
      isHydrated.value = true
    }
  }

  const saveState = debounce(async () => {
    if (!isHydrated.value || dbStore.dbStatus !== 'ready' || !dbStore.db) return

    try {
      const stateToSave = {
        chats: JSON.parse(JSON.stringify(chats.value)),
        currentChatId: currentChat.value?.id ?? null,
      }

      await dbStore.db.table(CHATS_STORE).put(stateToSave, CHATS_STORE_KEY)
    } catch (e) {
      console.error('[chatStore] Persist failed:', e)
    }
  }, 1000)

  // Trigger hydration when DB is unlocked/ready
  watch(
    () => dbStore.dbStatus,
    (status) => {
      if (status === 'ready') {
        hydrate()
      } else {
        // If DB locks or resets, mark as not hydrated to stop saving
        isHydrated.value = false
        pendingDeliveryReceipts.clear()
        chats.value = []
        closeCurrentChat()
      }
    },
    { immediate: true },
  )

  watch(
    [chats, currentChat],
    () => {
      if (isHydrated.value) {
        saveState()
      }
    },
    { deep: true },
  )

  return {
    chats,
    currentChat,
    currentChatMessages,
    isHydrated,
    hydrate,
    createNewChatFromContact,
    changeCurrentChat,
    closeCurrentChat,
    loadMessagesFromDB,
    loadPreviousMessages,
    loadNextMessages,
    addMessageToChat,
    applyDeliveryReceipts,
    applyReadReceipts,
    markVisibleMessagesAsRead,
  }
})
