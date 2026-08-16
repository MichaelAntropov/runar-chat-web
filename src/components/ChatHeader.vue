<script setup lang="ts">
import { Dropdown, Modal } from 'bootstrap'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  type ComputedRef,
  type Ref,
} from 'vue'
import { useI18n } from 'vue-i18n'

import { useBlockingStore } from '@/blocking/blockingStore'
import { useChatsStore } from '@/chat/chatStore'
import type { Chat } from '@/chat/types/chat/Chat'
import { usePresenceStore } from '@/presence/presenceStore'
import type { PresenceUpdate } from '@/presence/types/PresenceUpdate'
import { useSettingsStore } from '@/settings/settingsStore'
import { useUserStore } from '@/user/userStore'

interface MenuUser {
  id: string
  username: string
}

defineProps<{ isMobile: boolean }>()
const emit = defineEmits<{ back: [] }>()

const blockingStore = useBlockingStore()
const chatStore = useChatsStore()
const presenceStore = usePresenceStore()
const settingsStore = useSettingsStore()
const userStore = useUserStore()
const { t } = useI18n()

const reactiveNow: Ref<number> = ref(Date.now())
const menuToggleRef = useTemplateRef<HTMLElement>('menu-toggle')
const confirmationModalRef = useTemplateRef<HTMLElement>('confirmation-modal')
const menuDropdown: Ref<Dropdown | null> = ref(null)
const confirmationModal: Ref<Modal | null> = ref(null)
const pendingBlockUser: Ref<MenuUser | null> = ref(null)
const isUpdatingBlock = ref(false)
const isUpdatingReadReceipts = ref(false)
const blockUpdateError = ref(false)
const menuErrorKey: Ref<string | null> = ref(null)

let statusRefreshTimer: number

onMounted(() => {
  statusRefreshTimer = window.setInterval(() => {
    reactiveNow.value = Date.now()
  }, 10000)

  if (menuToggleRef.value) {
    menuDropdown.value = Dropdown.getOrCreateInstance(menuToggleRef.value, {
      autoClose: 'outside',
    })
  }
  if (confirmationModalRef.value) {
    confirmationModal.value = new Modal(confirmationModalRef.value, {
      backdrop: 'static',
      keyboard: false,
    })
  }

  void settingsStore.ensureReadReceiptModeLoaded()
})

onBeforeUnmount(() => {
  clearInterval(statusRefreshTimer)
  confirmationModal.value?.hide()
  confirmationModal.value?.dispose()
  menuDropdown.value?.dispose()
})

const currentChat: ComputedRef<Chat | null> = computed(() => chatStore.currentChat)
const isSavedMessages = computed(
  () => currentChat.value?.contact.userId === userStore.principal?.id,
)
const isCurrentUserBlocked = computed(() => {
  const userId = currentChat.value?.contact.userId
  return userId ? blockingStore.isBlocked(userId) : false
})
const effectiveReadReceiptsEnabled = computed(() => {
  if (settingsStore.readReceiptMode === 'ALL') return true
  if (settingsStore.readReceiptMode === 'PER_USER') {
    return currentChat.value?.readReceiptsEnabled !== false
  }
  return false
})
const readReceiptMenuLabel = computed(() => {
  if (settingsStore.readReceiptMode === null) return t('chat.menu.read-receipts-loading')
  if (settingsStore.readReceiptMode !== 'PER_USER') {
    return effectiveReadReceiptsEnabled.value
      ? t('chat.menu.read-receipts-on')
      : t('chat.menu.read-receipts-off')
  }
  return currentChat.value?.readReceiptsEnabled
    ? t('chat.menu.turn-off-read-receipts')
    : t('chat.menu.turn-on-read-receipts')
})

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

function getCurrentMenuUser(): MenuUser | null {
  const chat = currentChat.value
  if (!chat || isSavedMessages.value) return null
  return { id: chat.contact.userId, username: chat.contact.username }
}

function hideMenu(): void {
  if (menuToggleRef.value) {
    menuDropdown.value = Dropdown.getOrCreateInstance(menuToggleRef.value, {
      autoClose: 'outside',
    })
  }
  menuDropdown.value?.hide()
}

function openBlockConfirmation(): void {
  const user = getCurrentMenuUser()
  if (!user || !blockingStore.isLoaded || isUpdatingBlock.value) return

  pendingBlockUser.value = user
  blockUpdateError.value = false
  menuErrorKey.value = null
  hideMenu()
  confirmationModal.value?.show()
}

function closeBlockConfirmation(): void {
  if (isUpdatingBlock.value) return
  confirmationModal.value?.hide()
  pendingBlockUser.value = null
  blockUpdateError.value = false
}

async function confirmBlock(): Promise<void> {
  const user = pendingBlockUser.value
  if (!user || isUpdatingBlock.value) return

  isUpdatingBlock.value = true
  blockUpdateError.value = false
  try {
    await blockingStore.blockUser(user)
    confirmationModal.value?.hide()
    pendingBlockUser.value = null
  } catch (error) {
    console.error('[ChatHeader] Failed to block user:', error)
    blockUpdateError.value = true
  } finally {
    isUpdatingBlock.value = false
  }
}

async function unblockCurrentUser(): Promise<void> {
  const user = getCurrentMenuUser()
  if (!user || !blockingStore.isLoaded || isUpdatingBlock.value) return

  isUpdatingBlock.value = true
  menuErrorKey.value = null
  try {
    await blockingStore.unblockUser(user.id)
    hideMenu()
  } catch (error) {
    console.error('[ChatHeader] Failed to unblock user:', error)
    menuErrorKey.value = 'chat.menu.update-error'
  } finally {
    isUpdatingBlock.value = false
  }
}

async function retryBlockingState(): Promise<void> {
  menuErrorKey.value = null
  try {
    await blockingStore.fetchBlockedUsers(true)
  } catch (error) {
    console.error('[ChatHeader] Failed to refresh blocked users:', error)
    menuErrorKey.value = 'chat.menu.block-status-error'
  }
}

async function toggleCurrentChatReadReceipts(): Promise<void> {
  const chat = currentChat.value
  if (!chat || settingsStore.readReceiptMode !== 'PER_USER' || isUpdatingReadReceipts.value) {
    return
  }

  isUpdatingReadReceipts.value = true
  menuErrorKey.value = null
  try {
    await chatStore.updateReadReceiptsEnabled(chat.id, !chat.readReceiptsEnabled)
    hideMenu()
  } catch (error) {
    console.error('[ChatHeader] Failed to update read receipts:', error)
    menuErrorKey.value = 'chat.menu.update-error'
  } finally {
    isUpdatingReadReceipts.value = false
  }
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
    <div class="overflow-hidden flex-grow-1">
      <p class="fw-bold text-truncate m-0">
        {{ isSavedMessages ? t('sidebar.menu.saved-messages') : currentChat?.contact.username }}
      </p>
      <p v-if="statusText" class="small text-body-secondary text-truncate m-0">
        {{ statusText }}
      </p>
    </div>

    <div v-if="!isSavedMessages" class="dropdown flex-shrink-0">
      <button
        ref="menu-toggle"
        type="button"
        class="btn btn-more"
        data-bs-toggle="dropdown"
        data-bs-auto-close="outside"
        aria-expanded="false"
        :aria-label="t('chat.menu.open')"
        :title="t('chat.menu.open')"
      >
        <i class="bi bi-three-dots-vertical" aria-hidden="true"></i>
      </button>
      <div class="dropdown-menu dropdown-menu-end privacy-menu shadow">
        <button
          type="button"
          class="dropdown-item d-flex align-items-center gap-2"
          :class="{ 'text-danger': !isCurrentUserBlocked && blockingStore.isLoaded }"
          :disabled="!blockingStore.isLoaded || isUpdatingBlock"
          @click="isCurrentUserBlocked ? unblockCurrentUser() : openBlockConfirmation()"
        >
          <span
            v-if="isUpdatingBlock || (blockingStore.isLoading && !blockingStore.isLoaded)"
            class="spinner-border spinner-border-sm"
            aria-hidden="true"
          ></span>
          <i
            v-else
            class="bi"
            :class="isCurrentUserBlocked ? 'bi-person-check' : 'bi-person-x'"
            aria-hidden="true"
          ></i>
          <span v-if="!blockingStore.isLoaded">
            {{ t('chat.menu.block-status-loading') }}
          </span>
          <span v-else>
            {{ isCurrentUserBlocked ? t('chat.menu.unblock-user') : t('chat.menu.block-user') }}
          </span>
        </button>

        <button
          v-if="blockingStore.loadError && !blockingStore.isLoaded"
          type="button"
          class="dropdown-item small"
          :disabled="blockingStore.isLoading"
          @click="retryBlockingState"
        >
          {{ t('chat.menu.retry-block-status') }}
        </button>

        <div class="dropdown-divider"></div>

        <button
          type="button"
          class="dropdown-item d-flex align-items-center gap-2"
          :disabled="settingsStore.readReceiptMode !== 'PER_USER' || isUpdatingReadReceipts"
          @click="toggleCurrentChatReadReceipts"
        >
          <span
            v-if="isUpdatingReadReceipts"
            class="spinner-border spinner-border-sm"
            aria-hidden="true"
          ></span>
          <i v-else class="bi bi-check2-all" aria-hidden="true"></i>
          <span class="d-flex flex-column text-wrap">
            <span>{{ readReceiptMenuLabel }}</span>
            <small
              v-if="settingsStore.readReceiptMode && settingsStore.readReceiptMode !== 'PER_USER'"
              class="text-body-secondary"
            >
              {{ t('chat.menu.controlled-globally') }}
            </small>
          </span>
        </button>

        <div v-if="menuErrorKey" class="alert alert-danger small mx-2 mt-2 mb-1 py-2" role="alert">
          {{ t(menuErrorKey) }}
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      ref="confirmation-modal"
      class="modal fade"
      tabindex="-1"
      :aria-label="t('chat.menu.confirm-block-title')"
      aria-hidden="true"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title fs-5">{{ t('chat.menu.confirm-block-title') }}</h2>
          </div>
          <div class="modal-body">
            <p>
              {{
                t('chat.menu.confirm-block-message', {
                  username: pendingBlockUser?.username ?? '',
                })
              }}
            </p>
            <div v-if="blockUpdateError" class="alert alert-danger mb-0" role="alert">
              {{ t('chat.menu.update-error') }}
            </div>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="isUpdatingBlock"
              @click="closeBlockConfirmation"
            >
              {{ t('chat.menu.cancel') }}
            </button>
            <button
              type="button"
              class="btn btn-danger"
              :disabled="isUpdatingBlock"
              @click="confirmBlock"
            >
              <span
                v-if="isUpdatingBlock"
                class="spinner-border spinner-border-sm me-2"
                aria-hidden="true"
              ></span>
              {{ t('chat.menu.block-user') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
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

.btn-more {
  padding: 0.375rem 0.5rem;
  color: var(--bs-body-color);
  font-size: 1.25rem;
  line-height: 1;
}

.btn-more:hover,
.btn-more:focus-visible {
  background-color: var(--bs-secondary-bg);
}

.privacy-menu {
  min-width: 17rem;
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
