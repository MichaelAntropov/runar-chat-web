<script setup lang="ts">
import { useUserStore } from '@/user/UserStorage'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const userStore = useUserStore()

const loginBtnContent = computed(() => {
  if (!userStore.isAuthenticated) {
    return 'Log In'
  } else {
    return 'My chats'
  }
})

function gotToLogInOrChat() {
  if (!userStore.isAuthenticated) {
    router.push('/login')
  } else {
    router.push('/chat')
  }
}
</script>

<template>
  <nav class="navbar navbar-expand-sm bg-body-tertiary rounded">
    <div class="container-fluid">
      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbar"
        aria-controls="navbar"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse d-sm-flex" id="navbar">
        <a class="navbar-brand col-sm-3 me-0" href="#">Quarkus Chat</a>
        <ul class="navbar-nav col-sm-6 justify-content-sm-center"></ul>
        <div class="d-sm-flex col-sm-3 justify-content-sm-end">
          <button class="btn btn-primary" @click="gotToLogInOrChat">{{ loginBtnContent }}</button>
        </div>
      </div>
    </div>
  </nav>
</template>
