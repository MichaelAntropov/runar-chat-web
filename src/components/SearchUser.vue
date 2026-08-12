<script setup lang="ts">
import { debounce } from 'lodash'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useChatsStore } from '@/chat/chatStore'
import { contactApi } from '@/contacts/contactApi'
import { useContactsStore } from '@/contacts/contactStore'
import type { Contact } from '@/contacts/types/Contact'
import type { FoundUser } from '@/contacts/types/FindUserResponse'

const SEARCH_MIN_LENGTH = 5

const active = defineModel<boolean>('active', { default: false })
const emit = defineEmits<{
  'open-chat': []
}>()

const { t } = useI18n()
const chatsStore = useChatsStore()
const contactsStore = useContactsStore()

const searchInputRef = useTemplateRef<HTMLInputElement>('search-input')
const searchInput = ref('')
const foundUsers = ref<FoundUser[]>([])
const isSearching = ref(false)
const searchError = ref(false)
const searchCompleted = ref(false)

let searchGeneration = 0

const normalizedSearch = computed(() => searchInput.value.trim().replace(/^@/, ''))

async function searchUsers(username: string, generation: number): Promise<void> {
  try {
    const response = await contactApi.findUsersByUsername(username)
    if (generation !== searchGeneration) return

    foundUsers.value = response.foundUsers
    searchCompleted.value = true
  } catch (error: unknown) {
    if (generation !== searchGeneration) return

    console.error('[SearchUser] User search failed:', error)
    foundUsers.value = []
    searchError.value = true
  } finally {
    if (generation === searchGeneration) {
      isSearching.value = false
    }
  }
}

const debouncedSearch = debounce((username: string, generation: number) => {
  void searchUsers(username, generation)
}, 300)

function cancelPendingSearch() {
  searchGeneration++
  debouncedSearch.cancel()
  isSearching.value = false
}

function queueSearch(username: string) {
  cancelPendingSearch()
  foundUsers.value = []
  searchError.value = false
  searchCompleted.value = false

  if (!active.value || username.length < SEARCH_MIN_LENGTH) return

  isSearching.value = true
  debouncedSearch(username, searchGeneration)
}

function activateSearch() {
  active.value = true
}

function closeSearch() {
  active.value = false
}

function resetSearch() {
  cancelPendingSearch()
  searchInput.value = ''
  foundUsers.value = []
  searchError.value = false
  searchCompleted.value = false
  searchInputRef.value?.blur()
}

function retrySearch() {
  const username = normalizedSearch.value
  if (username.length < SEARCH_MIN_LENGTH) return

  cancelPendingSearch()
  foundUsers.value = []
  searchError.value = false
  searchCompleted.value = false
  isSearching.value = true
  void searchUsers(username, searchGeneration)
}

function openChatWithUser(foundUser: FoundUser) {
  const contact: Contact = { userId: foundUser.id, username: foundUser.username }
  contactsStore.addNewContact(contact)

  const chat = chatsStore.createNewChatFromContact(contact)
  chatsStore.changeCurrentChat(chat.id)

  closeSearch()
  emit('open-chat')
}

watch(normalizedSearch, queueSearch)

watch(active, (isActive) => {
  if (!isActive) resetSearch()
})

onBeforeUnmount(cancelPendingSearch)
</script>

<template>
  <form class="search-form" role="search" @submit.prevent="retrySearch">
    <div class="search-box">
      <input
        ref="search-input"
        v-model="searchInput"
        type="search"
        class="form-control search-input"
        :placeholder="t('sidebar.search.placeholder')"
        :aria-label="t('sidebar.search.placeholder')"
        autocomplete="off"
        spellcheck="false"
        @focus="activateSearch"
        @keydown.esc.prevent.stop="closeSearch"
      />
      <span class="search-indicator" aria-hidden="true">
        <span v-if="isSearching" class="spinner-border spinner-border-sm"></span>
        <i v-else class="bi bi-search"></i>
      </span>
    </div>
  </form>

  <Transition name="search-surface">
    <section
      v-if="active"
      class="search-results-surface"
      :aria-label="t('sidebar.search.results-label')"
    >
      <div
        v-if="normalizedSearch.length < SEARCH_MIN_LENGTH"
        class="search-state text-body-secondary"
      >
        <i class="bi bi-person-plus search-state__icon" aria-hidden="true"></i>
        <p class="mb-0">{{ t('sidebar.search.hint', { count: SEARCH_MIN_LENGTH }) }}</p>
      </div>

      <div
        v-else-if="isSearching"
        class="search-state text-body-secondary"
        role="status"
        aria-live="polite"
      >
        <span class="spinner-border" aria-hidden="true"></span>
        <p class="mb-0">{{ t('sidebar.search.searching') }}</p>
      </div>

      <div v-else-if="searchError" class="search-state" role="alert">
        <i class="bi bi-exclamation-circle search-state__icon text-danger" aria-hidden="true"></i>
        <p class="mb-0 text-body-secondary">{{ t('sidebar.search.error') }}</p>
        <button type="button" class="btn btn-outline-primary btn-sm" @click="retrySearch">
          {{ t('sidebar.search.retry') }}
        </button>
      </div>

      <div
        v-else-if="searchCompleted && foundUsers.length === 0"
        class="search-state text-body-secondary"
        role="status"
        aria-live="polite"
      >
        <i class="bi bi-search search-state__icon" aria-hidden="true"></i>
        <p class="mb-0">{{ t('sidebar.search.no-results') }}</p>
      </div>

      <div v-else-if="foundUsers.length > 0" class="list-group list-group-flush" aria-live="polite">
        <button
          v-for="foundUser in foundUsers"
          :key="foundUser.id"
          type="button"
          class="list-group-item list-group-item-action search-result"
          @click="openChatWithUser(foundUser)"
        >
          <span class="search-result__avatar" aria-hidden="true">
            {{ foundUser.username.charAt(0).toUpperCase() }}
          </span>
          <span class="text-truncate">@{{ foundUser.username }}</span>
        </button>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.search-form {
  flex: 1 1 auto;
  min-width: 0;
}

.search-box {
  position: relative;
  background: var(--bs-secondary-bg);
  border-radius: var(--bs-border-radius);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.3s ease;
}

.search-box:focus-within {
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.search-input {
  padding-right: 3rem;
  background-color: transparent;
}

.search-indicator {
  position: absolute;
  top: 50%;
  right: 1.1rem;
  color: var(--bs-secondary-color);
  transform: translateY(-50%);
}

.search-results-surface {
  position: absolute;
  z-index: 2;
  top: var(--chat-search-header-height);
  right: 0;
  bottom: 0;
  left: 0;
  overflow-y: auto;
  background: var(--bs-body-bg);
  border-top: var(--bs-border-width) solid var(--bs-border-color-translucent);
  transform-origin: center top;
  backface-visibility: hidden;
}

.search-state {
  display: flex;
  min-height: 12rem;
  padding: 2rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  text-align: center;
}

.search-state__icon {
  font-size: 2rem;
}

.search-result {
  display: flex;
  padding: 0.85rem 1rem;
  align-items: center;
  gap: 0.75rem;
  background: transparent;
}

.search-result__avatar {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 2.5rem;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  background: plum;
  border-radius: 50%;
}

.search-surface-enter-active,
.search-surface-leave-active {
  transition:
    opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    filter 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.search-surface-enter-from,
.search-surface-leave-to {
  opacity: 0;
  transform: translateZ(70px) scale(1.035);
}

.search-surface-enter-to,
.search-surface-leave-from {
  opacity: 1;
  transform: translateZ(0) scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .search-box,
  .search-surface-enter-active,
  .search-surface-leave-active {
    transition-duration: 0.01ms;
  }

  .search-surface-enter-from,
  .search-surface-leave-to {
    filter: none;
    transform: none;
  }
}
</style>
