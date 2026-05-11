<script setup lang="ts">
import { useUserStore } from '@/user/userStore'
import SearchUser from './SearchUser.vue'
import ChatList from './ChatList.vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits(['navigate', 'open-chat'])
const { t } = useI18n()
const userStore = useUserStore()
</script>

<template>
  <div class="d-flex flex-column h-100">
    <div class="container d-flex p-3">
      <button
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
          <button class="dropdown-item">
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
      <SearchUser></SearchUser>
    </div>
    <ChatList @open-chat="emit('open-chat')"></ChatList>
  </div>
</template>

<style scoped>
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
</style>
