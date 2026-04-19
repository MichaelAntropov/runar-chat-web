<script setup lang="ts">
import { registrationApi } from '@/registration/registrationApi'
import type { RegisterUserRequest } from '@/registration/types/RegisterUserPayload'
import router from '@/router'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const PASSWORD_REGEX = /^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/

const registrationData = reactive({
  username: '',
  password: '',
  confirmPassword: '',
})

const isAccepted = ref(false)

const errors = reactive({
  username: '',
  password: '',
  confirmPassword: '',
})

const touched = reactive({
  username: false,
  password: false,
  confirmPassword: false,
})

const isSubmitAvailable = computed(() => {
  if (!errors.username && !errors.password && !errors.confirmPassword && isAccepted.value) {
    return true
  } else {
    return false
  }
})

const submittingInProgress = ref(false)

function handleBlur(field: keyof typeof registrationData) {
  touched[field] = true
  validateField(field)
}

function handleInput(field: keyof typeof registrationData) {
  if (field === 'username' && errors.username) {
    validateField(field)
  }
  if (field === 'password' && errors.password) {
    validateField(field)
  }
  if (field === 'confirmPassword' && errors.confirmPassword) {
    validateField(field)
  }
}

function validateField(field: keyof typeof registrationData) {
  errors[field] = ''

  if (field === 'username') {
    const val = registrationData.username
    if (!val) {
      errors.username = 'USERNAME_EMPTY' // You can wrap this in t() in the template
    } else if (val.length < 5 || val.length > 64) {
      errors.username = 'USERNAME_LENGTH'
    }
  }

  if (field === 'password') {
    const val = registrationData.password
    if (!val) {
      errors.password = 'PWD_EMPTY'
    } else if (val.length < 8 || val.length > 256) {
      errors.password = 'PWD_LENGTH'
    } else if (!PASSWORD_REGEX.test(val)) {
      errors.password = 'PWD_REGEX'
    }
    // Re-validate confirm password if main password changes to clear mismatch error
    if (touched.confirmPassword) validateField('confirmPassword')
  }

  if (field === 'confirmPassword') {
    const val = registrationData.confirmPassword
    if (!val || val !== registrationData.password) {
      errors.confirmPassword = 'PWD_CONFIRM_NOT_MATCH'
    }
  }
}

async function register() {
  touched.username = true
  touched.password = true
  touched.confirmPassword = true

  validateField('username')
  validateField('password')
  validateField('confirmPassword')

  if (errors.username || errors.password || errors.confirmPassword || !isAccepted.value) {
    return
  }

  submittingInProgress.value = true

  const request: RegisterUserRequest = {
    username: registrationData.username,
    password: registrationData.password,
    confirmPassword: registrationData.confirmPassword,
    accepted: isAccepted.value,
  }
  try {
    await registrationApi.postRegisterUser(request)
    router.push('/login')
  } catch (error) {
    console.error('register() - Failed to send', error)
    throw error
  } finally {
    submittingInProgress.value = false
  }
}
</script>

<template>
  <div class="d-flex justify-content-center align-items-center min-vh-100">
    <div class="card p-4 shadow">
      <h2 class="text-center mb-4">{{ t('register.label.register') }}</h2>
      <form novalidate @submit.prevent="register">
        <!-- Username -->
        <div class="mb-4">
          <label for="username" class="form-label">{{ t('register.label.username') }}</label>
          <input
            type="text"
            id="username"
            class="form-control"
            :class="{ 'is-invalid': touched.username && errors.username }"
            v-model="registrationData.username"
            :placeholder="t('register.placeholder.username')"
            autocomplete="username"
            @blur="handleBlur('username')"
            @input="handleInput('username')"
          />
          <div class="invalid-feedback">
            {{ errors.username ? t(`register.error.${errors.username}`, errors.username) : '' }}
          </div>
        </div>
        <!-- Password -->
        <div class="mb-4">
          <label for="password" class="form-label">{{ t('register.label.password') }}</label>
          <input
            type="password"
            id="password"
            class="form-control"
            :class="{ 'is-invalid': touched.password && errors.password }"
            v-model="registrationData.password"
            :placeholder="t('register.placeholder.password')"
            autocomplete="new-password"
            @blur="handleBlur('password')"
            @input="handleInput('password')"
          />
          <div class="invalid-feedback">
            {{ errors.password ? t(`register.error.${errors.password}`, errors.password) : '' }}
          </div>
          <div class="form-text" :style="errors.password ? 'display: none' : ''">
            {{ t('register.label.password-prompt') }}
          </div>
        </div>
        <!-- Confirm Password -->
        <div class="mb-4">
          <label for="confirmPassword" class="form-label">{{
            t('register.label.confirm-password')
          }}</label>
          <input
            type="password"
            id="confirmPassword"
            class="form-control"
            :class="{ 'is-invalid': touched.confirmPassword && errors.confirmPassword }"
            v-model="registrationData.confirmPassword"
            :placeholder="t('register.placeholder.confirm-password')"
            autocomplete="new-password"
            @blur="handleBlur('confirmPassword')"
            @input="handleInput('confirmPassword')"
          />
          <div class="invalid-feedback">
            {{
              errors.confirmPassword
                ? t(`register.error.${errors.confirmPassword}`, errors.confirmPassword)
                : ''
            }}
          </div>
        </div>
        <!-- Checkbox -->
        <div class="form-check mb-4">
          <input class="form-check-input" type="checkbox" id="isAccepted" v-model="isAccepted" />
          <label class="form-check-label" for="isAccepted">
            {{ t('register.label.accept') }}
          </label>
        </div>
        <!-- Submit Button -->
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
            {{ t('register.button.registering') }}
          </span>
          <span v-else>
            {{ t('register.button.register') }}
          </span>
        </button>
        <div class="text-center mt-4">
          <p>
            {{ t('register.label.already-w-account') }}
            <RouterLink to="/login">{{ t('register.label.login') }}</RouterLink>
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
