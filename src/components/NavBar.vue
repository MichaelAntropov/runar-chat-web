<script setup lang="ts">
import { setLocale } from '@/i18n'
import { useTheme } from '@/theme/useTheme'
import { useUserStore } from '@/user/userStore'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t, locale } = useI18n()

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const { currentTheme, setTheme } = useTheme()

const loginBtnContent = computed(() => {
  if (!userStore.isAuthenticated) {
    return t('navbar.button.login')
  } else {
    return t('navbar.button.chats')
  }
})

function gotToLogInOrChat() {
  if (!userStore.isAuthenticated) {
    router.push('/login')
  } else {
    router.push('/chat')
  }
}

const showLoginButton = computed(() => {
  return route.name !== 'LoginScreen'
})
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
        <a class="navbar-brand col-sm-3 me-0" href="/" @click.prevent="router.push('/')"
          >VeilChat</a
        >
        <ul class="navbar-nav col-sm-6 justify-content-sm-center"></ul>
        <div class="d-sm-flex col-sm-3 justify-content-sm-end gap-2">
          <div class="dropdown dropdown-center me-2">
            <button
              class="btn btn-link nav-link dropdown-toggle py-2 d-flex align-items-center"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <i
                class="bi"
                :class="currentTheme === 'dark' ? 'bi-moon-stars-fill' : 'bi-brightness-high-fill'"
              ></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li>
                <button
                  class="dropdown-item"
                  :class="{ active: currentTheme === 'light' }"
                  type="button"
                  @click="setTheme('light')"
                >
                  {{ t('navbar.button.theme-light') }}
                </button>
              </li>
              <li>
                <button
                  class="dropdown-item"
                  :class="{ active: currentTheme === 'dark' }"
                  type="button"
                  @click="setTheme('dark')"
                >
                  {{ t('navbar.button.theme-dark') }}
                </button>
              </li>
            </ul>
          </div>
          <div class="dropdown dropdown-center me-2">
            <button
              class="btn btn-link nav-link dropdown-toggle py-2 d-flex align-items-center"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <i class="bi bi-globe2" style="padding-right: 5px"></i>{{ locale.toUpperCase() }}
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li>
                <button
                  class="dropdown-item"
                  :class="{ active: locale === 'en' }"
                  type="button"
                  @click="setLocale('en')"
                >
                  English
                </button>
              </li>
              <li>
                <button
                  class="dropdown-item"
                  :class="{ active: locale === 'ua' }"
                  type="button"
                  @click="setLocale('ua')"
                >
                  Українська
                </button>
              </li>
            </ul>
          </div>
          <a
            v-if="showLoginButton"
            class="btn btn-primary"
            href="/login"
            @click.prevent="gotToLogInOrChat"
          >
            {{ loginBtnContent }}
          </a>
        </div>
      </div>
    </div>
  </nav>
</template>
