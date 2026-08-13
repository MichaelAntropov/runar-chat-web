<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { openSavedMessagesChat } from '@/chat/ChatService'
import { useUserStore } from '@/user/userStore'

import ChatList from './ChatList.vue'
import SearchUser from './SearchUser.vue'

const emit = defineEmits<{
  navigate: [panel: string]
  'open-chat': []
}>()

const { t } = useI18n()
const userStore = useUserStore()
const searchActive = ref(false)

function openSavedMessages() {
  if (openSavedMessagesChat()) {
    emit('open-chat')
  }
}
</script>

<template>
  <div class="chats-panel d-flex flex-column h-100">
    <div class="chats-panel__header d-flex p-3">
      <button
        v-if="searchActive"
        type="button"
        class="btn link-body-emphasis me-2 menu-toggle"
        :aria-label="t('sidebar.search.back')"
        @click="searchActive = false"
      >
        <i class="bi bi-arrow-left menu-toggle__icon" aria-hidden="true"></i>
      </button>
      <button
        v-else
        type="button"
        class="btn link-body-emphasis me-2 menu-toggle"
        data-bs-toggle="dropdown"
        aria-label="Open menu"
      >
        <i class="bi bi-list menu-toggle__icon"></i>
      </button>
      <ul class="dropdown-menu text-small shadow" style="">
        <li>
          <button class="dropdown-item" @click="emit('navigate', 'my-profile')">
            <i class="bi bi-person me-2"></i>{{ t('sidebar.menu.my-profile') }}
          </button>
        </li>
        <li>
          <button class="dropdown-item" @click="openSavedMessages">
            <i class="bi bi-save2 me-2"></i>{{ t('sidebar.menu.saved-messages') }}
          </button>
        </li>
        <li>
          <button class="dropdown-item" @click="emit('navigate', 'settings')">
            <i class="bi bi-gear me-2"></i>{{ t('sidebar.menu.settings') }}
          </button>
        </li>
        <li>
          <button class="dropdown-item" @click="emit('navigate', 'theme')">
            <i class="bi bi-brightness-high me-2"></i>{{ t('sidebar.menu.theme') }}
          </button>
        </li>
        <li><hr class="dropdown-divider" /></li>
        <li>
          <button class="dropdown-item" @click.prevent="userStore.signOut">
            <i class="bi bi-box-arrow-right me-2"></i>{{ t('sidebar.menu.log-out') }}
          </button>
        </li>
      </ul>
      <SearchUser v-model:active="searchActive" @open-chat="emit('open-chat')" />
    </div>
    <div
      class="chat-list-stage flex-grow-1 overflow-hidden"
      :class="{ 'chat-list-stage--receded': searchActive }"
      :inert="searchActive"
      :aria-hidden="searchActive"
    >
      <ChatList class="h-100" @open-chat="emit('open-chat')" />
    </div>
  </div>
</template>

<style scoped>
.chats-panel {
  --chat-search-header-height: 70px;

  position: relative;
  overflow: hidden;
  perspective: 800px;
}

.chats-panel__header {
  min-height: var(--chat-search-header-height);
  background: var(--bs-body-bg);
}

.chat-list-stage {
  position: relative;
  z-index: 1;
  min-height: 0;
  transform: translateZ(0) scale(1);
  transform-origin: center top;
  backface-visibility: hidden;
  transition:
    opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    filter 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.chat-list-stage--receded {
  opacity: 0.18;
  filter: blur(2px);
  pointer-events: none;
  transform: translateZ(-80px) scale(0.97);
}

.menu-toggle {
  padding: 0.375rem 0.5rem;
  line-height: 1;
}

.menu-toggle__icon {
  font-size: 1.4rem;
  line-height: 1;
}

.menu-toggle:hover {
  background-color: var(--bs-secondary-bg);
}

@media (prefers-reduced-motion: reduce) {
  .chat-list-stage {
    transition-duration: 0.01ms;
  }

  .chat-list-stage--receded {
    filter: none;
    transform: none;
  }
}
</style>
