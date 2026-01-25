import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import type { Chat } from './types/chat/Chat'
import type { Contact } from '../contacts/types/Contact'
import type { StoredMessage } from './types/chat/StoredMessage'
import { messageRepository } from '@/db/repositories/MessageRepository'
import { useContactsStore } from '@/contacts/contactStore'
import { useDbStore } from '@/db/dbStore'
import { CHATS_STORE, CHATS_STORE_KEY } from '@/db/veilDB'
import { debounce } from 'lodash'

export const MESSAGE_LOAD_COUNT = 15
export const MESSAGE_LOAD_STEP = 5

export const useChatsStore = defineStore(
  'chats',
  () => {
    const dbStore = useDbStore()
    const contactsStore = useContactsStore()

    const chats: Ref<Array<Chat>> = ref([])
    const currentChat: Ref<Chat | null> = ref(null)

    const currentChatMessages: Ref<Array<StoredMessage>> = ref([])

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

        currentChatMessages.value = storedMessages.reverse()

        const totalMsgCount: number = await messageRepository.countByChatId(chat.id)
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

      chat.messagesOffset = offset
      currentChatMessages.value = storedMessages

      if (offset + currentChatMessages.value.length >= totalMsgCount) {
        chat.messagesOffset = -1
        chat.loadLatest = true
      }

      console.log(`currentChatMessages count: ${storedMessages.length}`)
      console.log('Next messages loaded!')
    }

    async function addMessageToChat(chat: Chat, message: StoredMessage) {
      messageRepository
        .saveMessage(message)
        .then(() => {
          console.log(`Message added id=${message.id} to chat with id=${chat.id}`)
          if (chat.id === currentChat.value?.id && chat.autoScroll) {
            currentChatMessages.value.push(message)
          }
        })
        .catch((error) => {
          console.log(`Could not add message to chat: ${error}`)
        })
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
        autoScroll: true,
        scrollPosition: null,
        messagesOffset: 0,
        loadLatest: true,
      }

      chats.value.push(newChat)
      return newChat
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

    const isHydrated = ref(false)

    async function hydrate() {
      if (!dbStore.db) return

      try {
        console.log('[chatStore] Hydrating from DB...')

        // Get the single record
        const record = await dbStore.db.table(CHATS_STORE).get(CHATS_STORE_KEY)

        if (record) {
          // 1. Restore Chats Array
          const restoredChats: Chat[] = record.chats || []

          // 2. Restore References (Re-link contacts)
          for (const chat of restoredChats) {
            const contactUserId = chat.contact.userId
            const contactRef = contactsStore.contacts.find((c) => c.userId === contactUserId)
            if (contactRef) {
              chat.contact = contactRef
            }
          }

          chats.value = restoredChats

          // 3. Restore Current Chat Selection
          if (record.currentChat) {
            // Find the reactive object in the array to ensure object identity
            const activeChat = chats.value.find((c) => c.id === record.currentChat.id)
            currentChat.value = activeChat || null

            // Load messages immediately if a chat was open?
            // loadMessagesFromDB()
          }
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
          currentChat: currentChat.value ? JSON.parse(JSON.stringify(currentChat.value)) : null,
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
          chats.value = []
          currentChat.value = null
        }
      },
      { immediate: true },
    )

    // Trigger save on changes
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
      createNewChatFromContact,
      changeCurrentChat,
      loadMessagesFromDB,
      loadPreviousMessages,
      loadNextMessages,
      addMessageToChat,
    }
  },
  {},
)
