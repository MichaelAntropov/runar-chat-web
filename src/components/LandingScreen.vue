<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import NavBar from './NavBar.vue'
import router from '@/router'
import { useUserStore } from '@/user/userStore'

const { t } = useI18n()
const userStore = useUserStore()

function gotToLogIn() {
  if (!userStore.isAuthenticated) {
    router.push('/login')
  }
}
</script>

<template>
  <header>
    <NavBar />
  </header>
  <main>
    <div class="container d-flex justify-content-center align-items-center vh-100">
      <div class="text-center">
        <h1>VeilChat</h1>
        <p>{{ t('landing.p.description') }}</p>
        <p>
          <a class="btn btn-lg btn-primary" href="/login" @click.prevent="gotToLogIn">{{
            t('landing.button.start')
          }}</a>
        </p>
      </div>
    </div>
  </main>
</template>
