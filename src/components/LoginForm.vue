<script setup lang="ts">
import { authApi } from '@/auth/api/authApi'
import type { AuthResponse } from '@/auth/types/AuthResponse'
import { NotAuthorizedError } from '@/auth/types/NotAuthorizedError'
import { useUserStore } from '@/user/userStore'
import { delay } from 'lodash'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()

const router = useRouter()
const userStore = useUserStore()

const PASSWORD_REGEX = /^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/

const userCredentials = reactive({
  username: '',
  password: '',
})

const errors = reactive({
  username: '',
  password: '',
  credentials: '',
})

const touched = reactive({
  username: false,
  password: false,
})

const submittingInProgress = ref(false)

const isSubmitAvailable = computed(() => {
  return !errors.username && !errors.password
})

function handleBlur(field: keyof typeof userCredentials) {
  touched[field] = true
  validateField(field)
}

function handleInput(field: keyof typeof userCredentials) {
  if (errors.credentials) {
    errors.credentials = ''
  }

  if (errors[field]) {
    validateField(field)
  }
}

function validateField(field: keyof typeof userCredentials) {
  errors[field] = ''
  errors['credentials'] = ''

  if (field === 'username') {
    const val = userCredentials.username
    if (!val) {
      errors.username = 'USERNAME_EMPTY'
    } else if (val.length < 5 || val.length > 64) {
      errors.username = 'USERNAME_LENGTH'
    }
  }

  if (field === 'password') {
    const val = userCredentials.password
    if (!val) {
      errors.password = 'PWD_EMPTY'
    } else if (val.length < 8 || val.length > 256) {
      errors.password = 'PWD_LENGTH'
    } else if (!PASSWORD_REGEX.test(val)) {
      errors.password = 'PWD_REGEX'
    }
  }
}

async function logIn() {
  touched.username = true
  touched.password = true

  validateField('username')
  validateField('password')

  if (errors.username || errors.password) {
    return
  }

  submittingInProgress.value = true

  try {
    const success = await authenticate(userCredentials.username, userCredentials.password)
    if (success) {
      router.push('/chat')
    }
  } finally {
    submittingInProgress.value = false
  }
}

async function authenticate(username: string, password: string): Promise<boolean> {
  try {
    const response: AuthResponse = await authApi.postAuth({ username, password })
    userStore.logIn(response.token)
    return true
  } catch (error) {
    if (error instanceof NotAuthorizedError) {
      await new Promise((resolve) => delay(resolve, 800))
      errors.credentials = 'INVALID_CREDENTIALS'
      return false
    }
    throw error
  }
}
</script>

<template>
  <div class="d-flex justify-content-center align-items-center min-vh-100">
    <div class="card p-4 shadow">
      <h2 class="text-center mb-4">{{ t('login.label.login') }}</h2>
      <form novalidate @submit.prevent="logIn">
        <div class="mb-3">
          <label for="username" class="form-label">{{ t('login.label.username') }}</label>
          <input
            type="text"
            id="username"
            class="form-control"
            :class="{ 'is-invalid': (touched.username && errors.username) || errors.credentials }"
            v-model="userCredentials.username"
            autocomplete="username"
            @blur="handleBlur('username')"
            @input="handleInput('username')"
          />
          <div class="invalid-feedback">
            {{ errors.username ? t(`login.error.${errors.username}`, errors.username) : '' }}
          </div>
        </div>

        <div class="mb-3">
          <label for="password" class="form-label">{{ t('login.label.password') }}</label>
          <input
            type="password"
            id="password"
            class="form-control"
            :class="{ 'is-invalid': (touched.password && errors.password) || errors.credentials }"
            v-model="userCredentials.password"
            autocomplete="current-password"
            @blur="handleBlur('password')"
            @input="handleInput('password')"
          />
          <div class="invalid-feedback">
            {{ errors.password ? t(`login.error.${errors.password}`, errors.password) : '' }}
          </div>
        </div>

        <div v-if="errors.credentials" class="text-danger text-center small mb-3">
          {{ t(`login.error.${errors.credentials}`, errors.credentials) }}
        </div>

        <button
          type="submit"
          class="btn btn-primary w-100"
          :disabled="!isSubmitAvailable || submittingInProgress"
        >
          <span
            v-if="submittingInProgress"
            class="spinner-border spinner-border-sm me-2"
            role="status"
            aria-hidden="true"
          ></span>
          <span v-if="submittingInProgress">
            {{ t('login.button.logging-in', 'Logging in...') }}
          </span>
          <span v-else>
            {{ t('login.button.login') }}
          </span>
        </button>

        <div class="text-center mt-3">
          <p>
            {{ t('login.label.no-account') }}
            <RouterLink to="/register">{{ t('login.label.register') }}</RouterLink>
          </p>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.card {
  border-radius: 10px;
  width: 350px;
}
</style>
