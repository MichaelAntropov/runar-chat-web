<script setup lang="ts">
import { Modal } from 'bootstrap'
import { debounce } from 'lodash'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBlockingStore } from '@/blocking/blockingStore'
import type { BlockedUser } from '@/blocking/types/BlockedUser'
import { contactApi } from '@/contacts/contactApi'
import type { FoundUser } from '@/contacts/types/FindUserResponse'

type ConfirmationAction = 'block' | 'unblock'

interface PendingConfirmation {
  action: ConfirmationAction
  user: Pick<BlockedUser, 'id' | 'username'>
}

const SEARCH_MIN_LENGTH = 5

const { locale, t } = useI18n()
const blockingStore = useBlockingStore()

const searchInput = ref('')
const foundUsers: Ref<Array<FoundUser>> = ref([])
const isSearching = ref(false)
const searchError = ref(false)

const confirmationModalRef = useTemplateRef<HTMLElement>('confirmation-modal')
const confirmationModal = ref<Modal | null>(null)
const pendingConfirmation: Ref<PendingConfirmation | null> = ref(null)
const isUpdating = ref(false)
const updateError = ref(false)

let searchGeneration = 0

const normalizedSearch = computed(() => searchInput.value.trim().replace(/^@/, ''))

const confirmationTitle = computed(() => {
  if (!pendingConfirmation.value) return ''
  return t(`settings.blocking.confirm-${pendingConfirmation.value.action}-title`)
})

const confirmationMessage = computed(() => {
  if (!pendingConfirmation.value) return ''
  return t(`settings.blocking.confirm-${pendingConfirmation.value.action}-message`, {
    username: pendingConfirmation.value.user.username,
  })
})

const debouncedSearch = debounce(async (username: string, generation: number) => {
  try {
    const response = await contactApi.findUsersByUsername(username)
    if (generation !== searchGeneration) return
    foundUsers.value = response.foundUsers
  } catch (error) {
    if (generation !== searchGeneration) return
    console.error('[BlockedUsersPanel] Failed to search users:', error)
    foundUsers.value = []
    searchError.value = true
  } finally {
    if (generation === searchGeneration) {
      isSearching.value = false
    }
  }
}, 300)

watch(normalizedSearch, (username) => {
  searchGeneration++
  debouncedSearch.cancel()
  foundUsers.value = []
  searchError.value = false

  if (username.length < SEARCH_MIN_LENGTH) {
    isSearching.value = false
    return
  }

  isSearching.value = true
  debouncedSearch(username, searchGeneration)
})

onMounted(() => {
  if (confirmationModalRef.value) {
    confirmationModal.value = new Modal(confirmationModalRef.value, {
      backdrop: 'static',
      keyboard: false,
    })
  }

  if (!blockingStore.isLoaded && !blockingStore.isLoading) {
    retryLoad()
  }
})

onBeforeUnmount(() => {
  searchGeneration++
  debouncedSearch.cancel()
  confirmationModal.value?.hide()
  confirmationModal.value?.dispose()
})

async function retryLoad() {
  try {
    await blockingStore.fetchBlockedUsers(true)
  } catch (error) {
    console.error('[BlockedUsersPanel] Failed to load blocked users:', error)
  }
}

function openConfirmation(action: ConfirmationAction, user: Pick<BlockedUser, 'id' | 'username'>) {
  pendingConfirmation.value = { action, user }
  updateError.value = false
  confirmationModal.value?.show()
}

function closeConfirmation() {
  if (isUpdating.value) return
  confirmationModal.value?.hide()
  pendingConfirmation.value = null
  updateError.value = false
}

async function confirmAction() {
  const pending = pendingConfirmation.value
  if (!pending || isUpdating.value) return

  isUpdating.value = true
  updateError.value = false

  try {
    if (pending.action === 'block') {
      await blockingStore.blockUser(pending.user)
    } else {
      await blockingStore.unblockUser(pending.user.id)
    }

    confirmationModal.value?.hide()
    pendingConfirmation.value = null
  } catch (error) {
    console.error(`[BlockedUsersPanel] Failed to ${pending.action} user:`, error)
    updateError.value = true
  } finally {
    isUpdating.value = false
  }
}

function formatDate(dateString: string): string {
  const utcString = dateString.endsWith('Z') ? dateString : `${dateString}Z`
  const date = new Date(utcString)

  if (Number.isNaN(date.getTime())) return '-'

  const dateLocale = locale.value === 'ua' ? 'uk-UA' : 'en'

  return new Intl.DateTimeFormat(dateLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
</script>

<template>
  <div class="h-100 overflow-y-auto pb-3">
    <section class="px-3 pb-3">
      <label class="form-label fw-medium" for="blocked-user-search">
        {{ t('settings.blocking.search-label') }}
      </label>
      <div class="position-relative">
        <input
          id="blocked-user-search"
          v-model="searchInput"
          type="search"
          class="form-control pe-5"
          :placeholder="t('settings.blocking.search-placeholder')"
          autocomplete="off"
        />
        <div class="search-indicator position-absolute top-50 translate-middle-y">
          <span
            v-if="isSearching"
            class="spinner-border spinner-border-sm"
            role="status"
            :aria-label="t('settings.blocking.searching')"
          ></span>
          <i v-else class="bi bi-search text-body-secondary" aria-hidden="true"></i>
        </div>
      </div>

      <small
        v-if="normalizedSearch.length > 0 && normalizedSearch.length < SEARCH_MIN_LENGTH"
        class="d-block text-body-secondary mt-2"
      >
        {{ t('settings.blocking.search-hint', { count: SEARCH_MIN_LENGTH }) }}
      </small>

      <div v-if="searchError" class="alert alert-danger py-2 mt-2 mb-0" role="alert">
        {{ t('settings.blocking.search-error') }}
      </div>

      <div v-if="foundUsers.length > 0" class="list-group mt-2">
        <div
          v-for="user in foundUsers"
          :key="user.id"
          class="list-group-item d-flex align-items-center gap-2"
        >
          <span class="user-avatar flex-shrink-0">{{ user.username.charAt(0).toUpperCase() }}</span>
          <span class="text-truncate flex-grow-1">@{{ user.username }}</span>
          <span v-if="blockingStore.isBlocked(user.id)" class="badge text-bg-secondary">
            {{ t('settings.blocking.blocked') }}
          </span>
          <button
            v-else
            type="button"
            class="btn btn-outline-danger btn-sm"
            @click="openConfirmation('block', user)"
          >
            {{ t('settings.blocking.block') }}
          </button>
        </div>
      </div>

      <p
        v-else-if="normalizedSearch.length >= SEARCH_MIN_LENGTH && !isSearching && !searchError"
        class="text-body-secondary text-center small my-3"
      >
        {{ t('settings.blocking.no-search-results') }}
      </p>
    </section>

    <hr class="m-0" />

    <section class="px-3 pt-3">
      <h2 class="fs-6 fw-medium mb-3">{{ t('settings.blocking.blocked-users') }}</h2>

      <div
        v-if="blockingStore.isLoading && !blockingStore.isLoaded"
        class="d-flex justify-content-center p-3"
      >
        <div class="spinner-border" role="status">
          <span class="visually-hidden">{{ t('settings.blocking.loading') }}</span>
        </div>
      </div>

      <div v-if="blockingStore.loadError" class="alert alert-danger" role="alert">
        <p class="mb-2">{{ t('settings.blocking.load-error') }}</p>
        <button
          type="button"
          class="btn btn-outline-danger btn-sm"
          :disabled="blockingStore.isLoading"
          @click="retryLoad"
        >
          {{ t('settings.blocking.retry') }}
        </button>
      </div>

      <p
        v-if="
          blockingStore.isLoaded &&
          !blockingStore.isLoading &&
          blockingStore.blockedUsers.length === 0
        "
        class="text-body-secondary text-center fst-italic my-3"
      >
        {{ t('settings.blocking.no-blocked-users') }}
      </p>

      <div v-if="blockingStore.blockedUsers.length > 0" class="list-group">
        <div
          v-for="user in blockingStore.blockedUsers"
          :key="user.id"
          class="list-group-item d-flex align-items-center gap-2"
        >
          <span class="user-avatar flex-shrink-0">{{ user.username.charAt(0).toUpperCase() }}</span>
          <div class="flex-grow-1 overflow-hidden">
            <p class="text-truncate mb-0">@{{ user.username }}</p>
            <small class="text-body-secondary">
              {{ t('settings.blocking.blocked-at', { date: formatDate(user.blockedAt) }) }}
            </small>
          </div>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm flex-shrink-0"
            @click="openConfirmation('unblock', user)"
          >
            {{ t('settings.blocking.unblock') }}
          </button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div
        ref="confirmation-modal"
        class="modal fade"
        tabindex="-1"
        :aria-label="confirmationTitle"
        aria-hidden="true"
      >
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title fs-5">{{ confirmationTitle }}</h2>
            </div>
            <div class="modal-body">
              <p>{{ confirmationMessage }}</p>
              <div v-if="updateError" class="alert alert-danger mb-0" role="alert">
                {{ t('settings.blocking.update-error') }}
              </div>
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="isUpdating"
                @click="closeConfirmation"
              >
                {{ t('settings.blocking.cancel') }}
              </button>
              <button
                type="button"
                class="btn"
                :class="pendingConfirmation?.action === 'block' ? 'btn-danger' : 'btn-primary'"
                :disabled="isUpdating"
                @click="confirmAction"
              >
                <span
                  v-if="isUpdating"
                  class="spinner-border spinner-border-sm me-2"
                  aria-hidden="true"
                ></span>
                {{
                  pendingConfirmation?.action === 'block'
                    ? t('settings.blocking.block')
                    : t('settings.blocking.unblock')
                }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.search-indicator {
  right: 1rem;
}

.user-avatar {
  display: inline-block;
  width: 2.25rem;
  height: 2.25rem;
  color: white;
  font-weight: 500;
  line-height: 2.25rem;
  text-align: center;
  background: plum;
  border-radius: 50%;
}
</style>
