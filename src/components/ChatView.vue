<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBlockingStore } from '@/blocking/blockingStore'
import {
  flushPendingReadReceipts,
  queueReadReceipts,
  sendMessageInCurrentChat,
} from '@/chat/ChatService'
import { useChatsStore } from '@/chat/chatStore'
import type { StoredMessage } from '@/chat/types/chat/StoredMessage'
import { MessageReceiverBlockedError } from '@/chat/types/message/MessageReceiverBlockedError'
import { runtimePolicy } from '@/core/config/runtimePolicy'
import { useUserStore } from '@/user/userStore'

import ChatHeader from './ChatHeader.vue'
import MessageBubble from './MessageBubble.vue'

defineProps<{ isMobile: boolean }>()
const emit = defineEmits(['back'])

interface MessageDateGroup {
  dateKey: string
  messages: Array<{ index: number; message: StoredMessage }>
  timestamp: number
}

const messageTextArea = useTemplateRef<HTMLTextAreaElement>('message-text-area')
const messagesContainer = ref<HTMLElement>()
const sendError = ref('')
const activeStickyDateKey = ref<string | null>(null)
const isActiveDateStuck = ref(false)
const isStickyDateVisible = ref(false)

const { locale, t } = useI18n()
const blockingStore = useBlockingStore()
const userStore = useUserStore()
const chatStore = useChatsStore()

const STICKY_DATE_HIDE_DELAY_MS = 2500

let messageObserver: IntersectionObserver | null = null
let readFlushTimer: number | null = null
let stickyDateHideTimer: number | null = null
let isLoadingMessagePage = false
const pendingVisibleMessageIds = new Set<string>()

const isCurrentRecipientBlocked = computed(() => {
  const userId = chatStore.currentChat?.contact.userId
  return userId ? blockingStore.isBlocked(userId) : false
})
const isMessagingUnavailable = computed(() => !runtimePolicy.directMessageSendingEnabled)

const messageDateGroups = computed<MessageDateGroup[]>(() => {
  const groups: MessageDateGroup[] = []

  chatStore.currentChatMessages.forEach((message, index) => {
    const dateKey = formatDateTimeValue(message.createdAt)
    let currentGroup = groups[groups.length - 1]

    if (!currentGroup || currentGroup.dateKey !== dateKey) {
      currentGroup = { dateKey, messages: [], timestamp: message.createdAt }
      groups.push(currentGroup)
    }
    currentGroup.messages.push({ index, message })
  })

  return groups
})

function canMarkMessagesAsRead(): boolean {
  return (
    runtimePolicy.legacyDirectMessagingEnabled &&
    document.visibilityState === 'visible' &&
    document.hasFocus()
  )
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

function isSameLocalDate(firstTimestamp: number, secondTimestamp: number): boolean {
  const firstDate = new Date(firstTimestamp)
  const secondDate = new Date(secondTimestamp)

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  )
}

function formatDateDivider(timestamp: number): string {
  const messageDate = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)

  if (isSameLocalDate(timestamp, today.getTime())) return t('chat.date.today')
  if (isSameLocalDate(timestamp, yesterday.getTime())) return t('chat.date.yesterday')

  const dateLocale = locale.value === 'ua' ? 'uk-UA' : 'en'
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
  }
  if (messageDate.getFullYear() !== today.getFullYear()) options.year = 'numeric'

  return new Intl.DateTimeFormat(dateLocale, options).format(messageDate)
}

function formatDateTimeValue(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function updateStickyDate(): void {
  const container = messagesContainer.value
  if (!container) return

  const containerRect = container.getBoundingClientRect()
  const dateGroups = container.querySelectorAll<HTMLElement>('[data-date-group]')
  const firstDivider = dateGroups[0]?.querySelector<HTMLElement>('.date-divider')
  const stickyOffset = firstDivider
    ? Number.parseFloat(window.getComputedStyle(firstDivider).top) || 0
    : 0
  const stickyTop = containerRect.top + stickyOffset
  let activeGroup: HTMLElement | null = null

  for (const group of dateGroups) {
    const groupRect = group.getBoundingClientRect()
    if (groupRect.top <= stickyTop + 1 && groupRect.bottom > stickyTop) {
      activeGroup = group
      break
    }
    if (!activeGroup && groupRect.bottom > containerRect.top) activeGroup = group
  }

  const divider = activeGroup?.querySelector<HTMLElement>('.date-divider')
  if (!activeGroup || !divider) {
    activeStickyDateKey.value = null
    isActiveDateStuck.value = false
    return
  }

  const groupRect = activeGroup.getBoundingClientRect()
  const dividerRect = divider.getBoundingClientRect()
  activeStickyDateKey.value = activeGroup.dataset.dateGroup ?? null
  isActiveDateStuck.value = groupRect.top < dividerRect.top - 1 && dividerRect.top <= stickyTop + 1
}

function showStickyDate(): void {
  updateStickyDate()
  if (activeStickyDateKey.value === null) return

  isStickyDateVisible.value = true
  if (stickyDateHideTimer !== null) window.clearTimeout(stickyDateHideTimer)
  stickyDateHideTimer = window.setTimeout(() => {
    stickyDateHideTimer = null
    isStickyDateVisible.value = false
  }, STICKY_DATE_HIDE_DELAY_MS)
}

function resetStickyDate(): void {
  if (stickyDateHideTimer !== null) window.clearTimeout(stickyDateHideTimer)
  stickyDateHideTimer = null
  activeStickyDateKey.value = null
  isActiveDateStuck.value = false
  isStickyDateVisible.value = false
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
    showStickyDate()
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
  const container = messagesContainer.value
  const chat = chatStore.currentChat
  const messages = chatStore.currentChatMessages
  if (!container || !chat || messages.length === 0 || isLoadingMessagePage) return

  const { scrollTop, scrollHeight, clientHeight } = container
  const shouldLoadPrevious = scrollTop < 1 && chat.messagesOffset !== 0
  const shouldLoadNext = scrollTop + clientHeight >= scrollHeight - 1 && !chat.loadLatest
  if (!shouldLoadPrevious && !shouldLoadNext) return

  const anchorMessage = shouldLoadPrevious ? messages[0] : messages[messages.length - 1]
  const anchorElement = document.getElementById(anchorMessage.id)
  const anchorOffset = anchorElement
    ? anchorElement.getBoundingClientRect().top - container.getBoundingClientRect().top
    : null

  isLoadingMessagePage = true
  try {
    if (shouldLoadPrevious) {
      console.log('On the top')
      await chatStore.loadPreviousMessages()
    } else {
      console.log('At the bottom')
      await chatStore.loadNextMessages()
    }

    await nextTick()
    const updatedAnchorElement = document.getElementById(anchorMessage.id)
    if (anchorOffset !== null && updatedAnchorElement) {
      const updatedAnchorOffset =
        updatedAnchorElement.getBoundingClientRect().top - container.getBoundingClientRect().top
      container.scrollTop += updatedAnchorOffset - anchorOffset
    }
  } finally {
    isLoadingMessagePage = false
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

  return (
    !nextMessage ||
    messages[index].senderId !== nextMessage.senderId ||
    !isSameLocalDate(messages[index].createdAt, nextMessage.createdAt)
  )
}

function isFirstMessageInSenderGroup(index: number): boolean {
  const messages = chatStore.currentChatMessages
  const previousMessage = messages[index - 1]

  return (
    !previousMessage ||
    messages[index].senderId !== previousMessage.senderId ||
    !isSameLocalDate(messages[index].createdAt, previousMessage.createdAt)
  )
}

async function sendMessage() {
  if (
    isMessagingUnavailable.value ||
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
    resetStickyDate()
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
    if (
      newMessages.length > 0 &&
      chatStore.currentChat?.autoScroll &&
      messagesContainer.value &&
      !isLoadingMessagePage
    ) {
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
  resetStickyDate()
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

    <div class="container-fluid overflow-y-auto position-relative" ref="messagesContainer">
      <div class="container p-2 mb-auto h-100" style="max-width: 900px">
        <div class="d-flex flex-column align-items-end">
          <div
            v-for="group in messageDateGroups"
            :key="group.dateKey"
            class="message-date-group"
            :data-date-group="group.dateKey"
          >
            <div
              class="date-divider"
              :class="{
                'date-divider-faded':
                  activeStickyDateKey === group.dateKey &&
                  isActiveDateStuck &&
                  !isStickyDateVisible,
              }"
            >
              <time class="date-badge" :datetime="group.dateKey">
                {{ formatDateDivider(group.timestamp) }}
              </time>
            </div>
            <MessageBubble
              v-for="entry in group.messages"
              :key="entry.message.id"
              :is-first-in-sender-group="isFirstMessageInSenderGroup(entry.index)"
              :is-last-in-sender-group="isLastMessageInSenderGroup(entry.index)"
              :message="entry.message"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="container pb-4 pt-2 mt-auto" style="max-width: 900px" v-if="chatStore.currentChat">
      <div v-if="isMessagingUnavailable" class="alert alert-info py-2" role="status">
        Direct messaging is temporarily unavailable while the new encrypted session runtime is
        being integrated.
      </div>
      <div v-else-if="isCurrentRecipientBlocked" class="alert alert-warning py-2" role="alert">
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
          :disabled="isCurrentRecipientBlocked || isMessagingUnavailable"
          @input="adjustMessageTextAreaHeight"
          @keypress.enter="handleEnterKeyPressed"
        ></textarea>
        <div class="mt-auto">
          <button
            class="btn btn-primary"
            :disabled="isCurrentRecipientBlocked || isMessagingUnavailable"
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

<style scoped>
.message-date-group {
  display: flex;
  width: 100%;
  flex-direction: column;
}

.date-divider {
  position: sticky;
  top: 0.5rem;
  z-index: 2;
  display: flex;
  width: 100%;
  justify-content: center;
  margin: 0.5rem 0 0.75rem;
  pointer-events: none;
  transition: opacity 200ms ease;
}

.date-divider-faded {
  opacity: 0;
}

.date-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background-color: var(--bs-secondary-bg);
  box-shadow: var(--bs-box-shadow-sm);
  color: var(--bs-secondary-color);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25rem;
}

.custom-textarea {
  max-height: 400px;
  overflow-y: auto;
  resize: none;
}
</style>
