<script setup lang="ts">
import { useUserStore } from '@/user/userStore'
import SearchUser from './SearchUser.vue'
import ChatList from './ChatList.vue'

const userStore = useUserStore()
</script>

<template>
  <div class="container d-flex p-3">
    <button
      type="button"
      class="btn btn-outline-secondary link-body-emphasis me-2 menu-toggle"
      data-bs-toggle="dropdown"
      aria-label="Open menu"
    >
      <i class="bi bi-list menu-toggle__icon"></i>
    </button>
    <ul class="dropdown-menu text-small shadow" style="">
      <li>
        <button class="dropdown-item"><i class="bi bi-person me-2"></i>My Profile</button>
      </li>
      <li>
        <button class="dropdown-item"><i class="bi bi-save2 me-2"></i>Saved Messages (You)</button>
      </li>
      <li>
        <button class="dropdown-item"><i class="bi bi-gear me-2"></i>Settings</button>
      </li>
      <li>
        <button class="dropdown-item"><i class="bi bi-brightness-high me-2"></i>Theme</button>
      </li>
      <li><hr class="dropdown-divider" /></li>
      <li>
        <button class="dropdown-item" @click.prevent="userStore.signOut">
          <i class="bi bi-box-arrow-right me-2"></i>Log Out
        </button>
      </li>
    </ul>
    <SearchUser></SearchUser>
  </div>
  <ChatList></ChatList>
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
</style>
