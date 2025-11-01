<script setup lang="ts">
import { useUserStore } from '@/user/UserStorage'
import SearchUser from './SearchUser.vue'
import ChatList from './ChatList.vue'

const userStore = useUserStore()
</script>

<template>
  <div class="container d-flex p-3">
    <a
      href="#"
      class="d-flex align-items-center justify-content-center link-body-emphasis text-decoration-none dropdown-toggle me-2"
      data-bs-toggle="dropdown"
      aria-expanded="false"
    >
      <img
        alt="mdo"
        width="24"
        height="24"
        class="rounded-circle"
        src="/src/assets/134d2f60-2cdc-48c8-8050-e8f7fc34f967.jpg"
      />
    </a>
    <ul class="dropdown-menu text-small shadow" style="">
      <li><a class="dropdown-item" href="#">Settings</a></li>
      <li><a class="dropdown-item" href="#">Profile</a></li>
      <li><hr class="dropdown-divider" /></li>
      <li><a class="dropdown-item" @click.prevent="userStore.signOut">Sign out</a></li>
    </ul>
    <SearchUser></SearchUser>
  </div>
  <ChatList></ChatList>
</template>
