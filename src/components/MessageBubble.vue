<script setup lang="ts">
import { computed, type ComputedRef } from 'vue'
import { useUserStore } from '@/user/userStore'
import type { StoredMessage } from '@/chat/types/chat/StoredMessage'

interface Props {
  message: StoredMessage
}
const props = defineProps<Props>()

const userStore = useUserStore()

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
  <div class="d-flex flex-column bubble m-2" :class="msgBubbleSideClass" :id="message.id">
    <p class="m-0 message-text-content text-body-emphasis">
      {{ props.message.content }}
    </p>
    <div class="d-flex align-items-center justify-content-end">
      <small class="text-muted">{{ formatDateFromTimestamp(props.message.createdAt) }}</small>
      <template v-if="msgBubbleSideClass === 'right'">
        <!-- <i v-if="message.read" class="bi bi-check-all text-info ms-1"></i> -->
        <!-- <i v-else-if="message.delivered" class="bi bi-check-all text-subtle ms-1"></i> -->
        <!-- <i v-else-if="message.id" class="bi bi-check text-subtle ms-1"></i> -->
        <i v-if="message.id" class="bi bi-check text-subtle ms-1"></i>
      </template>
    </div>
  </div>
</template>

<style scoped>
.bubble {
  --r: 1em; /* the radius */
  --t: 1.5em; /* the size of the tail */

  max-width: 60%;
  padding: 1em;
  border-inline: var(--t) solid #0000;
  border-radius: calc(var(--r) + var(--t)) / var(--r);
  mask:
    radial-gradient(100% 100% at var(--_p) 0, #0000 99%, #000 102%) var(--_p) 100% / var(--t)
      var(--t) no-repeat,
    linear-gradient(#000 0 0) padding-box;
  /* color: #fff; */
}
.left {
  --_p: 0;
  border-bottom-left-radius: 0 0;
  place-self: start;
  background-color: var(--bs-secondary-bg);
}
.right {
  --_p: 100%;
  border-bottom-right-radius: 0 0;
  place-self: end;
  /* background-color: var(--bs-primary); */
  background: linear-gradient(
      135deg,
      var(--bs-primary-border-subtle),
      var(--bs-primary-border-subtle)
    )
    border-box;
}
.message-text-content {
  white-space: pre-wrap;
}
</style>
