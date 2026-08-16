<script setup lang="ts">
import { computed, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { StoredMessage } from '@/chat/types/chat/StoredMessage'
import { useUserStore } from '@/user/userStore'

interface Props {
  isFirstInSenderGroup: boolean
  isLastInSenderGroup: boolean
  message: StoredMessage
}
const props = defineProps<Props>()

const { t } = useI18n()
const userStore = useUserStore()

const isOutgoingMessage = computed(() => props.message.senderId === userStore.principal?.id)
const isSavedMessage = computed(() => props.message.senderId === props.message.recipientId)
const messageStatus = computed<'delivered' | 'read' | 'sent' | null>(() => {
  if (!isOutgoingMessage.value || isSavedMessage.value) return null
  if (props.message.readAt !== null) return 'read'
  if (props.message.deliveredAt != null) return 'delivered'
  return 'sent'
})

const msgBubbleSideClass: ComputedRef<string> = computed(() => {
  if (props.message.senderId === userStore.principal?.id || !props.message.senderId) {
    return 'right'
  } else {
    return 'left'
  }
})

const formatDateFromTimestamp = (timestamp: number | undefined): string => {
  if (!timestamp) return ''
  const date = new Date(timestamp)

  const dateString = date.toLocaleDateString('en-GB')
  const timeString = date.toLocaleTimeString('en-GB')

  return `${dateString} ${timeString}`
}
</script>

<template>
  <div
    class="d-flex flex-column bubble mx-2"
    :class="[
      msgBubbleSideClass,
      {
        'sender-group-start': isFirstInSenderGroup,
        'sender-group-end': isLastInSenderGroup,
      },
    ]"
    :id="message.id"
    :data-message-id="message.id"
  >
    <p class="m-0 message-text-content text-body-emphasis">
      {{ props.message.content }}
    </p>
    <div class="d-flex align-items-center justify-content-end">
      <small class="text-muted">{{ formatDateFromTimestamp(props.message.createdAt) }}</small>
      <template v-if="messageStatus">
        <i
          v-if="messageStatus === 'read'"
          class="bi bi-check-all text-info ms-1"
          :aria-label="t('chat.message-status.read')"
          :title="t('chat.message-status.read')"
        ></i>
        <i
          v-else-if="messageStatus === 'delivered'"
          class="bi bi-check-all text-subtle ms-1"
          :aria-label="t('chat.message-status.delivered')"
          :title="t('chat.message-status.delivered')"
        ></i>
        <i
          v-else
          class="bi bi-check text-subtle ms-1"
          :aria-label="t('chat.message-status.sent')"
          :title="t('chat.message-status.sent')"
        ></i>
      </template>
    </div>
  </div>
</template>

<style scoped>
.bubble {
  --r: 1em; /* the radius */
  --t: 1.5em; /* the size of the tail */
  --group-r: 0.35em;

  max-width: 60%;
  padding: 1em;
  border-radius: var(--r);
  margin-bottom: 6px;
}
.bubble.sender-group-end {
  border-inline: var(--t) solid #0000;
  border-radius: calc(var(--r) + var(--t)) / var(--r);
  margin-bottom: 10px;
  mask:
    radial-gradient(100% 100% at var(--_p) 0, #0000 99%, #000 102%) var(--_p) 100% / var(--t)
      var(--t) no-repeat,
    linear-gradient(#000 0 0) padding-box;
}
.left {
  --_p: 0;
  place-self: start;
  background-color: var(--bs-secondary-bg);
}
.left:not(.sender-group-start):not(.sender-group-end) {
  border-top-left-radius: var(--group-r);
}
.left.sender-group-end:not(.sender-group-start) {
  border-top-left-radius: calc(var(--t) + var(--group-r)) var(--group-r);
}
.left:not(.sender-group-end) {
  border-bottom-left-radius: var(--group-r);
  margin-left: calc(var(--t) + 0.5rem) !important;
}
.left.sender-group-end {
  border-bottom-left-radius: 0 0;
}
.right {
  --_p: 100%;
  place-self: end;
  background-color: var(--bs-primary-border-subtle);
}
.right:not(.sender-group-start):not(.sender-group-end) {
  border-top-right-radius: var(--group-r);
}
.right.sender-group-end:not(.sender-group-start) {
  border-top-right-radius: calc(var(--t) + var(--group-r)) var(--group-r);
}
.right:not(.sender-group-end) {
  border-bottom-right-radius: var(--group-r);
  margin-right: calc(var(--t) + 0.5rem) !important;
}
.right.sender-group-end {
  border-bottom-right-radius: 0 0;
}
.message-text-content {
  white-space: pre-wrap;
}
</style>
