import { defineStore } from 'pinia'
import { ref, type Ref } from 'vue'
import type { Chat } from './interfaces/chat/Chat'
import type { Contact } from '../contacts/Contact'
import type { StoredMessage } from './interfaces/chat/StoredMessage'
import { db, MESSAGES_STORE } from '../db/DbStorage'
import Dexie from 'dexie'

export const MESSAGE_LOAD_COUNT = 15
export const MESSAGE_LOAD_STEP = 5

export const useChatsStore = defineStore(
  'chats',
  () => {
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
        // https://github.com/dexie/Dexie.js/issues/167
        const storedMessages = await db[MESSAGES_STORE].where('[chatId+createdAt]')
          .between([chat.id, Dexie.minKey], [chat.id, Dexie.maxKey])
          .reverse()
          .offset(0)
          .limit(MESSAGE_LOAD_COUNT + 2 * MESSAGE_LOAD_STEP)
          .toArray()

        currentChatMessages.value = storedMessages.reverse()

        const totalMsgCount = await db[MESSAGES_STORE].where('chatId').equals(chat.id).count()
        if (totalMsgCount > MESSAGE_LOAD_COUNT + 2 * MESSAGE_LOAD_STEP) {
          chat.messagesOffset = -1
        }
      } else {
        console.log('loadMessagesFromDB() - Load offset messages')
        const storedMessages = await db[MESSAGES_STORE].where('[chatId+createdAt]')
          .between([chat.id, Dexie.minKey], [chat.id, Dexie.maxKey])
          .offset(chat.messagesOffset)
          .limit(MESSAGE_LOAD_COUNT + 2 * MESSAGE_LOAD_STEP)
          .toArray()

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

      const totalMsgCount = await db[MESSAGES_STORE].where('chatId').equals(chat.id).count()
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

      const storedMessages = await db[MESSAGES_STORE].where('[chatId+createdAt]')
        .between([chat.id, Dexie.minKey], [chat.id, Dexie.maxKey])
        .offset(offset)
        .limit(MESSAGE_LOAD_COUNT + 2 * MESSAGE_LOAD_STEP)
        .toArray()

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

      const totalMsgCount = await db[MESSAGES_STORE].where('chatId').equals(chat.id).count()
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

      const storedMessages = await db[MESSAGES_STORE].where('[chatId+createdAt]')
        .between([chat.id, Dexie.minKey], [chat.id, Dexie.maxKey])
        .offset(offset)
        .limit(MESSAGE_LOAD_COUNT + 2 * MESSAGE_LOAD_STEP)
        .toArray()

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
      db[MESSAGES_STORE].add(message, message.id)
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
        id: window.crypto.randomUUID(),
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
  {
    persist: {
      storage: localStorage,
      pick: ['chats', 'currentChat'],
      afterHydrate: (ctx) => {
        // Restore reference
        // https://prazdevs.github.io/pinia-plugin-persistedstate/guide/limitations.html#references-are-not-persisted
        const chats: Array<Chat> = ctx.store.$state['chats']
        const currentChat: Chat | null | undefined = ctx.store.$state['currentChat']
        if (currentChat) {
          ctx.store.$state['currentChat'] = chats.find((val) => val.id === currentChat.id)
        }
      },
    },
  },
)
