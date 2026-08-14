<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBlockingStore } from '@/blocking/blockingStore'
import {
  flushPendingReadReceipts,
  queueReadReceipts,
  sendMessageInCurrentChat,
} from '@/chat/ChatService'
import { MESSAGE_LOAD_STEP, useChatsStore } from '@/chat/chatStore'
import { MessageReceiverBlockedError } from '@/chat/types/message/MessageReceiverBlockedError'
import { useUserStore } from '@/user/userStore'

import ChatHeader from './ChatHeader.vue'
import MessageBubble from './MessageBubble.vue'

defineProps<{ isMobile: boolean }>()
const emit = defineEmits(['back'])

const messageTextArea = useTemplateRef<HTMLTextAreaElement>('message-text-area')
const messagesContainer = ref<HTMLElement>()
const sendError = ref('')

const { t } = useI18n()
const blockingStore = useBlockingStore()
const userStore = useUserStore()
const chatStore = useChatsStore()

let messageObserver: IntersectionObserver | null = null
let readFlushTimer: number | null = null
const pendingVisibleMessageIds = new Set<string>()

const isCurrentRecipientBlocked = computed(() => {
  const userId = chatStore.currentChat?.contact.userId
  return userId ? blockingStore.isBlocked(userId) : false
})

function canMarkMessagesAsRead(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus()
}

function isSufficientlyVisible(element: HTMLElement): boolean {
  const container = messagesContainer.value
  if (!container) return false

  const elementRect = element.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const visibleContainerTop = Math.max(containerRect.top, 0)
  const visibleContainerBottom = Math.min(containerRect.bottom, window.innerHeight)
  const visibleContainerHeight = Math.max(0, visibleContainerBottom - visibleContainerTop)
  const visibleHeight = Math.max(
    0,
    Math.min(elementRect.bottom, visibleContainerBottom) -
      Math.max(elementRect.top, visibleContainerTop),
  )
  const availableHeight = Math.min(elementRect.height, visibleContainerHeight)
  return availableHeight > 0 && visibleHeight >= availableHeight * 0.5
}

function queueVisibleMessage(element: HTMLElement): void {
  const chat = chatStore.currentChat
  const principalId = userStore.principal?.id
  const messageId = element.dataset.messageId
  if (!chat || !principalId || !messageId || chat.contact.userId === principalId) return

  const message = chatStore.currentChatMessages.find((candidate) => candidate.id === messageId)
  if (!message || message.senderId !== chat.contact.userId || message.readAt !== null) return

  pendingVisibleMessageIds.add(messageId)
  scheduleVisibleReadFlush()
}

function markCurrentlyVisibleMessages(): void {
  if (!canMarkMessagesAsRead() || !messagesContainer.value) return
  const elements = messagesContainer.value.querySelectorAll<HTMLElement>('[data-message-id]')
  for (const element of elements) {
    if (isSufficientlyVisible(element)) queueVisibleMessage(element)
  }
}

function scheduleVisibleReadFlush(): void {
  if (readFlushTimer !== null) return
  readFlushTimer = window.setTimeout(() => {
    readFlushTimer = null
    void flushVisibleReads()
  }, 50)
}

async function flushVisibleReads(): Promise<void> {
  const chat = chatStore.currentChat
  if (!chat || !canMarkMessagesAsRead() || pendingVisibleMessageIds.size === 0) return

  const messageIds = [...pendingVisibleMessageIds]
  pendingVisibleMessageIds.clear()
  const receipts = await chatStore.markVisibleMessagesAsRead(chat, messageIds)
  try {
    await queueReadReceipts(chat, receipts)
  } catch (error) {
    console.error('[ChatView] Failed to queue read receipts:', error)
  }
}

async function observeMessageBubbles(): Promise<void> {
  messageObserver?.disconnect()
  messageObserver = null
  if (!messagesContainer.value) return

  await nextTick()
  messageObserver = new IntersectionObserver(
    (entries) => {
      if (!canMarkMessagesAsRead()) return
      for (const entry of entries) {
        const element = entry.target as HTMLElement
        if (entry.isIntersecting && isSufficientlyVisible(element)) {
          queueVisibleMessage(element)
        }
      }
    },
    { root: messagesContainer.value, threshold: [0, 0.5] },
  )

  const elements = messagesContainer.value.querySelectorAll<HTMLElement>('[data-message-id]')
  elements.forEach((element) => messageObserver?.observe(element))
  markCurrentlyVisibleMessages()
}

function handlePageVisibilityOrFocus(): void {
  if (canMarkMessagesAsRead()) markCurrentlyVisibleMessages()
}

const adjustMessageTextAreaHeight = () => {
  if (messageTextArea.value !== null) {
    messageTextArea.value.style.height = 'auto' // Reset height
    messageTextArea.value.style.height = Math.min(messageTextArea.value.scrollHeight, 400) + 'px' // Grow until...
    if (messagesContainer.value && chatStore.currentChat && chatStore.currentChat.autoScroll)
      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: 'auto',
      })
  }
}

function handleScrollChange() {
  if (messagesContainer.value) {
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1 // -1 for precision
    if (chatStore.currentChat && isAtBottom) {
      chatStore.currentChat.autoScroll = true
      chatStore.currentChat.scrollPosition = null
    }
    if (chatStore.currentChat && !isAtBottom) {
      chatStore.currentChat.autoScroll = false
      chatStore.currentChat.scrollPosition = scrollTop
    }
    markCurrentlyVisibleMessages()
  }
}

async function loadMessagesOnScroll() {
  if (messagesContainer.value) {
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value

    if (scrollTop < 1) {
      console.log('On the top')
      if (chatStore.currentChat && chatStore.currentChat.messagesOffset !== 0) {
        const currentFirstMessageId = chatStore.currentChatMessages[0].id
        await chatStore.loadPreviousMessages()

        if (chatStore.currentChatMessages.length > MESSAGE_LOAD_STEP) {
          let heightToOffset = 0
          let outerHeightToOffset = 0

          let actuallyLoadedCount = 0
          for (let i = 0; i < chatStore.currentChatMessages.length; i++) {
            if (chatStore.currentChatMessages[i].id === currentFirstMessageId) {
              actuallyLoadedCount = i
              break
            }
          }

          for (let i = 0; i < actuallyLoadedCount; i++) {
            const msgDiv = document.getElementById(chatStore.currentChatMessages[i].id)
            if (msgDiv) {
              heightToOffset += msgDiv?.scrollHeight
              outerHeightToOffset += parseInt(
                window.getComputedStyle(msgDiv).getPropertyValue('margin-top'),
              )
              outerHeightToOffset += parseInt(
                window.getComputedStyle(msgDiv).getPropertyValue('margin-bottom'),
              )
            }
          }

          messagesContainer.value.scrollTop = heightToOffset + outerHeightToOffset
        }
      }
    }

    if (scrollTop + clientHeight >= scrollHeight - 1) {
      console.log('At the bottom')
      if (chatStore.currentChat && !chatStore.currentChat.loadLatest) {
        const currentLastMessageId =
          chatStore.currentChatMessages[chatStore.currentChatMessages.length - 1].id
        await chatStore.loadNextMessages()

        if (chatStore.currentChatMessages.length > MESSAGE_LOAD_STEP) {
          let heightToOffset = 0
          let outerHeightToOffset = 0

          let actuallyLoadedCount = 0
          for (let i = chatStore.currentChatMessages.length - 1; i >= 0; i--) {
            if (chatStore.currentChatMessages[i].id === currentLastMessageId) {
              actuallyLoadedCount = chatStore.currentChatMessages.length - 1 - i
              break
            }
          }

          for (let i = 0; i < actuallyLoadedCount; i++) {
            const index = chatStore.currentChatMessages.length - 1 - i
            const msgDiv = document.getElementById(chatStore.currentChatMessages[index].id)
            if (msgDiv) {
              heightToOffset += msgDiv?.scrollHeight
              outerHeightToOffset += parseInt(
                window.getComputedStyle(msgDiv).getPropertyValue('margin-top'),
              )
              outerHeightToOffset += parseInt(
                window.getComputedStyle(msgDiv).getPropertyValue('margin-bottom'),
              )
            }
          }

          messagesContainer.value.scrollTop =
            messagesContainer.value.scrollHeight -
            messagesContainer.value.clientHeight -
            heightToOffset -
            outerHeightToOffset
        }
      }
    }
  }
}

function handleEnterKeyPressed(event: KeyboardEvent) {
  if (!messageTextArea.value || isCurrentRecipientBlocked.value) {
    return
  }

  if (event.shiftKey) {
    messageTextArea.value.value += '\n'
    event.preventDefault()
    adjustMessageTextAreaHeight()
  } else {
    sendMessage()
    event.preventDefault()
  }
}

function isLastMessageInSenderGroup(index: number): boolean {
  const messages = chatStore.currentChatMessages
  const nextMessage = messages[index + 1]

  return !nextMessage || messages[index].senderId !== nextMessage.senderId
}

function isFirstMessageInSenderGroup(index: number): boolean {
  const messages = chatStore.currentChatMessages
  const previousMessage = messages[index - 1]

  return !previousMessage || messages[index].senderId !== previousMessage.senderId
}

async function sendMessage() {
  if (
    !chatStore.currentChat ||
    !messageTextArea.value?.value ||
    !userStore.principal ||
    isCurrentRecipientBlocked.value
  ) {
    return
  }

  sendError.value = ''

  try {
    await sendMessageInCurrentChat(messageTextArea.value.value)
    await chatStore.loadMessagesFromDB()

    messageTextArea.value.value = ''
    adjustMessageTextAreaHeight()
  } catch (error) {
    if (error instanceof MessageReceiverBlockedError) {
      sendError.value = t('chat.blocking.send-blocked')
      blockingStore.fetchBlockedUsers(true).catch((fetchError) => {
        console.error('[ChatView] Failed to refresh blocked users:', fetchError)
      })
      return
    }

    console.error('[ChatView] Failed to send message:', error)
    sendError.value = t('chat.send-error')
  }
}

watch(
  () => chatStore.currentChat,
  async (newChat) => {
    sendError.value = ''
    pendingVisibleMessageIds.clear()
    messageObserver?.disconnect()
    if (newChat) {
      console.log(`Load messages for ${newChat.id}`)
      await chatStore.loadMessagesFromDB()
      await nextTick()

      if (messagesContainer.value && newChat.scrollPosition) {
        messagesContainer.value.scrollTop = newChat.scrollPosition
      }

      if (messagesContainer.value && newChat.autoScroll) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
      await observeMessageBubbles()
    }
  },
  { immediate: true },
)

watch(
  () => chatStore.isHydrated,
  (isHydrated) => {
    if (isHydrated) void flushPendingReadReceipts()
  },
  { immediate: true },
)

async function reloadLatestOnScrollEnd() {
  if (messagesContainer.value) {
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value

    if (scrollTop + clientHeight >= scrollHeight - 1) {
      console.log('Reload messages from DB after smooth scroll')
      await chatStore.loadMessagesFromDB()
      messagesContainer.value.removeEventListener('scroll', reloadLatestOnScrollEnd)
    }
  }
}

watch(
  () => chatStore.currentChatMessages.map((message) => message.id),
  async (newMessages) => {
    if (newMessages.length > 0 && chatStore.currentChat?.autoScroll && messagesContainer.value) {
      await nextTick() // Wait for Vue to re-render messages

      console.log('Auto scroll....')

      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: 'smooth',
      })

      messagesContainer.value.addEventListener('scroll', reloadLatestOnScrollEnd)
    }
    await observeMessageBubbles()
  },
  { immediate: true },
)

onMounted(() => {
  if (messagesContainer.value) {
    messagesContainer.value.addEventListener('scroll', handleScrollChange)
    messagesContainer.value.addEventListener('scroll', loadMessagesOnScroll)
  }
  document.addEventListener('visibilitychange', handlePageVisibilityOrFocus)
  window.addEventListener('focus', handlePageVisibilityOrFocus)
  window.addEventListener('resize', handlePageVisibilityOrFocus)
  void observeMessageBubbles()
})

onUnmounted(() => {
  messageObserver?.disconnect()
  if (readFlushTimer !== null) window.clearTimeout(readFlushTimer)
  pendingVisibleMessageIds.clear()
  if (messagesContainer.value) {
    messagesContainer.value.removeEventListener('scroll', handleScrollChange)
    messagesContainer.value.removeEventListener('scroll', loadMessagesOnScroll)
  }
  document.removeEventListener('visibilitychange', handlePageVisibilityOrFocus)
  window.removeEventListener('focus', handlePageVisibilityOrFocus)
  window.removeEventListener('resize', handlePageVisibilityOrFocus)
})
</script>

<template>
  <div class="h-100 d-flex flex-column">
    <ChatHeader :isMobile="isMobile" @back="emit('back')" />

    <div class="container-fluid overflow-y-auto" ref="messagesContainer">
      <div class="container p-2 mb-auto h-100" style="max-width: 900px">
        <div class="d-flex flex-column align-items-end">
          <template v-for="(msg, index) in chatStore.currentChatMessages" :key="msg.id">
            <MessageBubble
              :is-first-in-sender-group="isFirstMessageInSenderGroup(index)"
              :is-last-in-sender-group="isLastMessageInSenderGroup(index)"
              :message="msg"
            />
          </template>
        </div>
      </div>
    </div>

    <div class="container pb-4 pt-2 mt-auto" style="max-width: 900px" v-if="chatStore.currentChat">
      <div v-if="isCurrentRecipientBlocked" class="alert alert-warning py-2" role="alert">
        {{ t('chat.blocking.send-blocked') }}
      </div>
      <div v-else-if="sendError" class="alert alert-danger py-2" role="alert">
        {{ sendError }}
      </div>
      <form class="d-flex w-100" role="send" @submit.prevent>
        <textarea
          ref="message-text-area"
          class="form-control me-2 flex-grow-1 custom-textarea"
          :placeholder="t('chat.message-placeholder')"
          aria-label="Send"
          rows="1"
          :disabled="isCurrentRecipientBlocked"
          @input="adjustMessageTextAreaHeight"
          @keypress.enter="handleEnterKeyPressed"
        ></textarea>
        <div class="mt-auto">
          <button
            class="btn btn-primary"
            :disabled="isCurrentRecipientBlocked"
            @click="sendMessage"
          >
            <div style="rotate: 45deg" aria-label="Send">
              <i class="bi bi-send"></i>
            </div>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style>
.custom-textarea {
  max-height: 400px;
  overflow-y: auto;
  resize: none;
}
</style>
