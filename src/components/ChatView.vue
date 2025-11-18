<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import MessageBubble from './MessageBubble.vue'
import { MESSAGE_LOAD_STEP, useChatsStore } from '@/chat/chatStore'
import { useUserStore } from '@/user/UserStorage'
import { sendMessageInCurrentChat } from '@/chat/chatService'

const messageTextArea = useTemplateRef<HTMLTextAreaElement>('message-text-area')
const messagesContainer = ref<HTMLElement>()

const userStore = useUserStore()
const chatStore = useChatsStore()

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
  if (!messageTextArea.value) {
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

async function sendMessage() {
  if (!chatStore.currentChat || !messageTextArea.value?.value || !userStore.principal) {
    return
  }

  await sendMessageInCurrentChat(messageTextArea.value?.value)
  await chatStore.loadMessagesFromDB()

  messageTextArea.value.value = ''
  adjustMessageTextAreaHeight()
}

watch(
  () => chatStore.currentChat,
  async (newChat) => {
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
    }
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
  () => chatStore.currentChatMessages,
  async (newMessages) => {
    if (newMessages && chatStore.currentChat?.autoScroll && messagesContainer.value) {
      await nextTick() // Wait for Vue to re-render messages

      console.log('Auto scroll....')

      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: 'smooth',
      })

      messagesContainer.value.addEventListener('scroll', reloadLatestOnScrollEnd)
    }
  },
  { deep: true, immediate: true }, // deep watches array changes
)

onMounted(async () => {
  if (messagesContainer.value) {
    messagesContainer.value.addEventListener('scroll', handleScrollChange)
    messagesContainer.value.addEventListener('scroll', loadMessagesOnScroll)
  }

  chatStore.loadMessagesFromDB()
})

onUnmounted(() => {
  if (messagesContainer.value) {
    messagesContainer.value.removeEventListener('scroll', handleScrollChange)
    messagesContainer.value.removeEventListener('scroll', loadMessagesOnScroll)
  }
})
</script>

<template>
  <div class="container-fluid overflow-y-auto" ref="messagesContainer">
    <div class="container p-2 mb-auto h-100" style="max-width: 900px">
      <div class="d-flex flex-column align-items-end">
        <template v-for="msg in chatStore.currentChatMessages" :key="msg.id">
          <MessageBubble :message="msg" />
        </template>
      </div>
    </div>
  </div>

  <div class="container pb-4 pt-2 mt-auto" style="max-width: 900px" v-if="chatStore.currentChat">
    <form class="d-flex w-100" role="send" @submit.prevent>
      <textarea
        ref="message-text-area"
        class="form-control me-2 flex-grow-1 custom-textarea"
        placeholder="Type your message..."
        aria-label="Send"
        rows="1"
        @input="adjustMessageTextAreaHeight"
        @keypress.enter="handleEnterKeyPressed"
      ></textarea>
      <div class="mt-auto">
        <button class="btn btn-primary" @click="sendMessage">
          <div style="rotate: 45deg" aria-label="Send">
            <i class="bi bi-send"></i>
          </div>
        </button>
      </div>
    </form>
  </div>
</template>

<style>
.custom-textarea {
  max-height: 400px; /* Maximum height before scrolling */
  overflow-y: auto; /* Scrollable after reaching max height */
  resize: none; /* Prevent manual resizing */
}
</style>
