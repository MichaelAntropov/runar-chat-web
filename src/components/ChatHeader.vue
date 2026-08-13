<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatsStore } from '@/chat/chatStore'
import { usePresenceStore } from '@/presence/presenceStore'
import type { PresenceUpdate } from '@/presence/types/PresenceUpdate'
import type { Chat } from '@/chat/types/chat/Chat'
import { useUserStore } from '@/user/userStore'

defineProps<{ isMobile: boolean }>()
const emit = defineEmits<{ back: [] }>()

const chatStore = useChatsStore()
const presenceStore = usePresenceStore()
const userStore = useUserStore()
const { t } = useI18n()

const reactiveNow: Ref<number> = ref(Date.now())

onMounted(() => {
  statusRefreshTimer = window.setInterval(() => {
    reactiveNow.value = Date.now()
  }, 10000)
})

onUnmounted(() => {
  clearInterval(statusRefreshTimer)
})

let statusRefreshTimer: number

const currentChat: ComputedRef<Chat | null> = computed(() => chatStore.currentChat)
const isSavedMessages = computed(
  () => currentChat.value?.contact.userId === userStore.principal?.id,
)

const presence: ComputedRef<PresenceUpdate | null> = computed(() => {
  const chat = currentChat.value
  return chat ? (presenceStore.presenceMap.get(chat.contact.userId) ?? null) : null
})

const avatarLetter: ComputedRef<string> = computed(() => {
  const name = currentChat.value?.contact?.username
  return name ? name.charAt(0).toUpperCase() : '?'
})

const statusText: ComputedRef<string | null> = computed(() => {
  if (isSavedMessages.value) return null

  const now = reactiveNow.value

  if (!presence.value) return t('presence.last-seen-recently')
  if (presence.value.isOnline) return t('presence.online')
  if (presence.value.lastActiveAt) return formatRelativeTime(presence.value.lastActiveAt, now)
  return t('presence.last-seen-recently')
})

function formatRelativeTime(isoString: string, now: number): string {
  const diffSec = Math.floor((now - new Date(isoString).getTime()) / 1000)
  if (diffSec < 60) return t('presence.last-seen-just-now')
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return t('presence.last-seen-minutes', { n: diffMin })
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return t('presence.last-seen-hours', { n: diffHr })
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return t('presence.last-seen-days', { n: diffDay })
  return t('presence.last-seen-date', { date: new Date(isoString).toLocaleDateString() })
}
</script>

<template>
  <div
    v-if="currentChat"
    class="chat-header px-3 py-2 border-bottom d-flex align-items-center gap-2"
  >
    <button
      v-if="isMobile"
      class="btn link-body-emphasis me-2 btn-back"
      aria-label="Go back"
      type="button"
      @click="emit('back')"
    >
      <i class="bi bi-arrow-left btn-back__icon" aria-hidden="true"></i>
    </button>
    <span v-if="isSavedMessages" class="saved-messages-avatar flex-shrink-0">
      <i class="bi bi-save2" aria-hidden="true"></i>
    </span>
    <p v-else :data-letters="avatarLetter" class="m-0 contact-avatar flex-shrink-0"></p>
    <div class="overflow-hidden">
      <p class="fw-bold text-truncate m-0">
        {{ isSavedMessages ? t('sidebar.menu.saved-messages') : currentChat?.contact.username }}
      </p>
      <p v-if="statusText" class="small text-body-secondary text-truncate m-0">
        {{ statusText }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.chat-header {
  min-height: 62px;
}

.btn-back {
  padding: 0.375rem 0.5rem;
  line-height: 1;
}

.btn-back__icon {
  font-size: 1.4rem;
  line-height: 1;
}

.btn-back:hover {
  background-color: var(--bs-secondary-bg);
}

.contact-avatar:before {
  content: attr(data-letters);
  display: inline-block;
  font-size: 1.5rem;
  width: 2.5rem;
  height: 2.5rem;
  line-height: 2.5rem;
  font-weight: 500;
  text-align: center;
  border-radius: 50%;
  background: plum;
  vertical-align: middle;
  margin-right: 0;
  color: white;
}

.saved-messages-avatar {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 1.25rem;
  background: plum;
  border-radius: 50%;
}
</style>
