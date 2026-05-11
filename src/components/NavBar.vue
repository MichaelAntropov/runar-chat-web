<script setup lang="ts">
import { setLocale, availableLocales } from '@/i18n'
import { useTheme } from '@/theme/useTheme'
import { useUserStore } from '@/user/userStore'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { locale, t } = useI18n()

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

const loginBtnRoute = computed(() => {
  return userStore.isAuthenticated ? '/chat' : '/login'
})

const showLoginButton = computed(() => {
  return route.name !== 'LoginScreen'
})
</script>

<template>
  <nav class="navbar navbar-expand-md bg-body-tertiary rounded sticky-top shadow-sm">
    <div class="container-fluid">
      <RouterLink class="navbar-brand fw-bold" to="/">Runar Chat</RouterLink>

      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarContent"
        aria-controls="navbarContent"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" id="navbarContent">
        <!-- SPACER: 'me-auto' pushes everything else to the right -->
        <ul class="navbar-nav me-auto mb-2 mb-lg-0"></ul>
        <ul class="navbar-nav my-2 my-lg-0 navbar-nav-scroll" style="--bs-scroll-height: vh50">
          <li class="nav-item">
            <a
              class="btn btn-link nav-link d-flex align-items-center justify-content-center w-100 px-3 px-md-2"
              href="https://github.com/MichaelAntropov"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <i class="bi bi-github fs-5"></i>
              <span class="d-md-none ms-2 fw-semibold">GitHub</span>
            </a>
          </li>
          <div class="vr d-none d-md-block"></div>
          <li class="nav-item dropdown">
            <button
              class="btn btn-link nav-link dropdown-toggle d-flex align-items-center justify-content-center w-100 px-3 px-md-2"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
              aria-label="Toggle theme"
            >
              <i
                class="bi fs-5"
                :class="currentTheme === 'dark' ? 'bi-moon-stars-fill' : 'bi-brightness-high-fill'"
              ></i>
              <span class="d-md-none ms-2 fw-semibold">Theme</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li>
                <button
                  class="dropdown-item d-flex align-items-center gap-2 justify-content-center justify-content-lg-start"
                  :class="{ active: currentTheme === 'light' }"
                  type="button"
                  @click="setTheme('light')"
                >
                  <i class="bi bi-brightness-high-fill"></i>
                  {{ t('navbar.button.theme-light') }}
                </button>
              </li>
              <li>
                <button
                  class="dropdown-item d-flex align-items-center gap-2 justify-content-center justify-content-lg-start"
                  :class="{ active: currentTheme === 'dark' }"
                  type="button"
                  @click="setTheme('dark')"
                >
                  <i class="bi bi-moon-stars-fill"></i>
                  {{ t('navbar.button.theme-dark') }}
                </button>
              </li>
            </ul>
          </li>
          <li class="nav-item dropdown">
            <button
              class="btn btn-link nav-link dropdown-toggle d-flex align-items-center justify-content-center w-100 px-3 px-md-2"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
              aria-label="Select language"
            >
              <i class="bi bi-globe2 fs-5"></i>
              <span class="fw-semibold ms-2">{{ locale.toUpperCase() }}</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li v-for="lang in availableLocales" :key="lang.code">
                <button
                  class="dropdown-item d-flex align-items-center gap-2 justify-content-center justify-content-lg-start"
                  :class="{ active: locale === lang.code }"
                  type="button"
                  @click="setLocale(lang.code)"
                >
                  {{ lang.label }}
                </button>
              </li>
            </ul>
          </li>
        </ul>
        <RouterLink
          v-if="showLoginButton"
          class="btn btn-primary px-4 d-grid d-md-block ms-md-2"
          :to="loginBtnRoute"
        >
          {{ loginBtnContent }}
        </RouterLink>
      </div>
    </div>
  </nav>
</template>
