<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBlockingStore } from '@/blocking/blockingStore'
import { useContactsStore } from '@/contacts/contactStore'
import { usePresenceStore } from '@/presence/presenceStore'
import { useSettingsStore } from '@/settings/settingsStore'
import type { OnlineVisibility } from '@/settings/types/OnlineVisibility'

const { t } = useI18n()
const emit = defineEmits<{ navigate: [panel: string] }>()
const blockingStore = useBlockingStore()
const settingsStore = useSettingsStore()
const presenceStore = usePresenceStore()
const contactsStore = useContactsStore()

const localValue = ref<OnlineVisibility>('ALL')
const isLoading = ref(true)
const isUpdating = ref(false)

onMounted(async () => {
  if (!settingsStore.onlineVisibility) {
    await settingsStore.fetchSettings()
  }
  localValue.value = settingsStore.onlineVisibility || 'ALL'
  isLoading.value = false
})

async function onChange(value: OnlineVisibility) {
  if (isUpdating.value || value === localValue.value) return

  const oldValue = localValue.value
  localValue.value = value
  isUpdating.value = true

  try {
    await settingsStore.updateSettings(value)

    if (value === 'NONE') {
      presenceStore.clearSubscriptions()
    } else {
      const ids = contactsStore.contacts.map((c) => c.userId)
      presenceStore.subscribeToUsers(ids)
    }
  } catch (error) {
    console.error('[PrivacyAndSecurityPanel] Failed to update settings:', error)
    localValue.value = oldValue
  } finally {
    isUpdating.value = false
  }
}
</script>

<template>
  <div class="d-flex flex-column">
    <p class="m-2 p-3 pb-0 pt-0 fs-6 fw-medium">{{ t('settings.privacy.online-visibility') }}</p>

    <div v-if="isLoading" class="d-flex justify-content-center p-3">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <template v-else>
      <label
        class="privacy-option d-flex align-items-center p-3 m-1 rounded-3"
        :class="{ 'active-option': localValue === 'ALL' }"
      >
        <input
          class="form-check-input m-0 fs-5"
          type="radio"
          name="onlineVisibility"
          value="ALL"
          :disabled="isUpdating"
          :checked="localValue === 'ALL'"
          @change="onChange('ALL')"
        />
        <div class="ms-3 d-flex flex-column">
          <span>{{ t('settings.privacy.everyone') }}</span>
          <small class="text-body-secondary">{{ t('settings.privacy.everyone-desc') }}</small>
        </div>
      </label>

      <label
        class="privacy-option d-flex align-items-center p-3 m-1 rounded-3"
        :class="{ 'active-option': localValue === 'NONE' }"
      >
        <input
          class="form-check-input m-0 fs-5"
          type="radio"
          name="onlineVisibility"
          value="NONE"
          :disabled="isUpdating"
          :checked="localValue === 'NONE'"
          @change="onChange('NONE')"
        />
        <div class="ms-3 d-flex flex-column">
          <span>{{ t('settings.privacy.nobody') }}</span>
          <small class="text-body-secondary">{{ t('settings.privacy.nobody-desc') }}</small>
        </div>
      </label>
    </template>

    <hr class="mx-3 my-2" />

    <button
      type="button"
      class="btn privacy-option d-flex align-items-center text-start p-3 m-1 rounded-3"
      @click="emit('navigate', 'blocked-users')"
    >
      <i class="bi bi-person-x fs-5 me-3" aria-hidden="true"></i>
      <span class="flex-grow-1">{{ t('settings.blocking.blocked-users') }}</span>
      <span v-if="blockingStore.isLoaded" class="text-body-secondary me-2">
        {{ blockingStore.blockedUsers.length }}
      </span>
      <i class="bi bi-chevron-right text-body-secondary" aria-hidden="true"></i>
    </button>
  </div>
</template>

<style lang="css" scoped>
.privacy-option {
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
}

.privacy-option:hover {
  background-color: var(--bs-secondary-bg);
}

.privacy-option.active-option {
  background-color: var(--bs-secondary-bg);
}
</style>
