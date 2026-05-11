<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const emit = defineEmits(['navigate'])
const { t } = useI18n()
</script>

<template>
  <div class="d-flex flex-column">
    <button class="btn menu-option text-start p-3 m-1 rounded-3">
      <i class="bi bi-person fs-5 me-4"></i>{{ t('settings.menu.my-profile') }}
    </button>

    <button
      class="btn menu-option text-start p-3 m-1 rounded-3"
      @click="emit('navigate', 'devices')"
    >
      <i class="bi bi-phone fs-5 me-4"></i>{{ t('settings.menu.devices') }}
    </button>

    <button class="btn menu-option text-start p-3 m-1 rounded-3">
      <i class="bi bi-database fs-5 me-4"></i>{{ t('settings.menu.data-and-storage') }}
    </button>

    <button class="btn menu-option text-start p-3 m-1 rounded-3">
      <i class="bi bi-shield-lock fs-5 me-4"></i>{{ t('settings.menu.privacy-and-security') }}
    </button>

    <button class="btn menu-option text-start p-3 m-1 rounded-3" @click="emit('navigate', 'theme')">
      <i class="bi bi-brightness-high fs-5 me-4"></i>{{ t('settings.menu.theme') }}
    </button>

    <button
      class="btn menu-option text-start p-3 m-1 rounded-3"
      @click="emit('navigate', 'language')"
    >
      <i class="bi bi-globe2 fs-5 me-4"></i>{{ t('settings.menu.language') }}
    </button>
  </div>
</template>

<style lang="css" scoped>
.menu-option {
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
}

.menu-option:hover {
  background-color: var(--bs-secondary-bg);
}
</style>
