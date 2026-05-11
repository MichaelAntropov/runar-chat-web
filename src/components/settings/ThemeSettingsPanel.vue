<script setup lang="ts">
import { useTheme } from '@/theme/useTheme'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { currentTheme, setTheme } = useTheme()
</script>

<template>
  <div class="d-flex flex-column">
    <label
      class="theme-option d-flex align-items-center p-3 m-1 rounded-3"
      :class="{ 'active-theme': currentTheme === 'light' }"
    >
      <input
        class="form-check-input m-0 fs-5"
        type="radio"
        name="themeChoice"
        v-model="currentTheme"
        value="light"
        @change="setTheme('light')"
      />
      <span class="ms-3">{{ t('settings.theme.light') }}</span>
    </label>

    <label
      class="theme-option d-flex align-items-center p-3 m-1 rounded-3"
      :class="{ 'active-theme': currentTheme === 'dark' }"
    >
      <input
        class="form-check-input m-0 fs-5"
        type="radio"
        name="themeChoice"
        v-model="currentTheme"
        value="dark"
        @change="setTheme('dark')"
      />
      <span class="ms-3">{{ t('settings.theme.dark') }}</span>
    </label>
  </div>
</template>

<style lang="css" scoped>
.theme-option {
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
}

.theme-option:hover {
  background-color: var(--bs-secondary-bg);
}

.theme-option.active-theme {
  background-color: var(--bs-secondary-bg);
}
</style>
