<script setup lang="ts">
import NavBar from './NavBar.vue'
import type { AuthRequest } from '@/auth/types/AuthRequest'
import type { AuthResponse } from '@/auth/types/AuthResponse'
import { useUserStore } from '@/user/userStore'
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()

const router = useRouter()
const userStore = useUserStore()

const userCredentials = reactive({
  username: '',
  password: '',
})

async function logIn() {
  await authenticate(userCredentials.username, userCredentials.password).then(() => {
    router.push('/chat')
  })
}

async function authenticate(username: string, password: string) {
  await postAuth({ username, password }).then((response) => {
    userStore.isAuthenticated = true
    userStore.refreshToken = response.refreshToken
    userStore.accessToken = response.accessToken
  })
}

async function postAuth(data: AuthRequest): Promise<AuthResponse> {
  const response = await fetch('/api/v1/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }

  return await response.json()
}

if (userStore.isAuthenticated) {
  router.push('/chat')
}
</script>

<template>
  <header>
    <NavBar />
  </header>
  <main>
    <div class="d-flex justify-content-center align-items-center min-vh-100">
      <div class="card p-4 shadow">
        <h2 class="text-center mb-4">{{ t('login.label.login') }}</h2>
        <form>
          <div class="mb-3">
            <label for="username" class="form-label">{{ t('login.label.username') }}</label>
            <input
              type="text"
              id="username"
              class="form-control"
              v-model="userCredentials.username"
              required
            />
          </div>
          <div class="mb-3">
            <label for="password" class="form-label">{{ t('login.label.password') }}</label>
            <input
              type="password"
              id="password"
              class="form-control"
              v-model="userCredentials.password"
              required
            />
          </div>
          <button type="submit" class="btn btn-primary w-100" @click.prevent="logIn">
            {{ t('login.button.login') }}
          </button>
          <div class="text-center mt-3">
            <p>
              {{ t('login.label.no-account') }} <a href="#">{{ t('login.label.register') }}</a>
            </p>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.card {
  border-radius: 10px;
  width: 350px;
}
</style>
