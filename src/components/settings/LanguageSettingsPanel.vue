<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { setLocale, availableLocales } from '@/i18n'

const { locale } = useI18n()
</script>

<template>
  <div class="d-flex flex-column">
    <label
      v-for="lang in availableLocales"
      :key="lang.code"
      class="language-option d-flex align-items-center p-3 m-1 rounded-3"
      :class="{ 'active-language': locale === lang.code }"
    >
      <input
        class="form-check-input m-0 fs-5"
        type="radio"
        name="themeChoice"
        v-model="locale"
        :value="lang.code"
        @change="setLocale(lang.code)"
      />
      <span class="ms-3">{{ lang.label }}</span>
    </label>
  </div>
</template>

<style lang="css" scoped>
.language-option {
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
}

.language-option:hover {
  background-color: var(--bs-secondary-bg);
}

.language-option.active-language {
  background-color: var(--bs-secondary-bg);
}
</style>
