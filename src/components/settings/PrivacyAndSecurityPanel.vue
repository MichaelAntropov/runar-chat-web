<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBlockingStore } from '@/blocking/blockingStore'
import { flushPendingReadReceipts } from '@/chat/ChatService'
import { useContactsStore } from '@/contacts/contactStore'
import { usePresenceStore } from '@/presence/presenceStore'
import { useSettingsStore } from '@/settings/settingsStore'
import type { OnlineVisibility } from '@/settings/types/OnlineVisibility'
import type { ReadReceiptMode } from '@/settings/types/ReadReceiptMode'

const { t } = useI18n()
const emit = defineEmits<{ navigate: [panel: string] }>()
const blockingStore = useBlockingStore()
const settingsStore = useSettingsStore()
const presenceStore = usePresenceStore()
const contactsStore = useContactsStore()

const localValue = ref<OnlineVisibility>('ALL')
const localReadReceiptMode = ref<ReadReceiptMode>('ALL')
const isLoading = ref(true)
const isUpdating = ref(false)
const isUpdatingReadReceipts = ref(false)
const readReceiptUpdateError = ref(false)

const readReceiptOptions: Array<{
  descriptionKey: string
  labelKey: string
  value: ReadReceiptMode
}> = [
  {
    value: 'ALL',
    labelKey: 'settings.privacy.read-receipts-send-all',
    descriptionKey: 'settings.privacy.read-receipts-send-all-desc',
  },
  {
    value: 'PER_USER',
    labelKey: 'settings.privacy.read-receipts-per-user',
    descriptionKey: 'settings.privacy.read-receipts-per-user-desc',
  },
  {
    value: 'NONE',
    labelKey: 'settings.privacy.read-receipts-off',
    descriptionKey: 'settings.privacy.read-receipts-off-desc',
  },
]

onMounted(async () => {
  if (!settingsStore.onlineVisibility) {
    await settingsStore.fetchSettings()
  }
  await settingsStore.ensureReadReceiptModeLoaded()
  localValue.value = settingsStore.onlineVisibility || 'ALL'
  localReadReceiptMode.value = settingsStore.readReceiptMode ?? 'ALL'
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

async function onReadReceiptModeChange(value: ReadReceiptMode) {
  if (isUpdatingReadReceipts.value || value === localReadReceiptMode.value) return

  const oldValue = localReadReceiptMode.value
  localReadReceiptMode.value = value
  isUpdatingReadReceipts.value = true
  readReceiptUpdateError.value = false

  try {
    await settingsStore.updateReadReceiptMode(value)
    await flushPendingReadReceipts()
  } catch (error) {
    console.error('[PrivacyAndSecurityPanel] Failed to update read receipts:', error)
    localReadReceiptMode.value = oldValue
    readReceiptUpdateError.value = true
  } finally {
    isUpdatingReadReceipts.value = false
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

      <hr class="mx-3 my-2" />

      <p class="m-2 p-3 pb-0 pt-0 fs-6 fw-medium">
        {{ t('settings.privacy.read-receipts') }}
      </p>

      <label
        v-for="option in readReceiptOptions"
        :key="option.value"
        class="privacy-option d-flex align-items-center p-3 m-1 rounded-3"
        :class="{ 'active-option': localReadReceiptMode === option.value }"
      >
        <input
          class="form-check-input m-0 fs-5"
          type="radio"
          name="readReceiptMode"
          :value="option.value"
          :disabled="isUpdatingReadReceipts"
          :checked="localReadReceiptMode === option.value"
          @change="onReadReceiptModeChange(option.value)"
        />
        <div class="ms-3 d-flex flex-column">
          <span>{{ t(option.labelKey) }}</span>
          <small class="text-body-secondary">{{ t(option.descriptionKey) }}</small>
        </div>
      </label>

      <div v-if="readReceiptUpdateError" class="alert alert-danger mx-3 mt-2 mb-0" role="alert">
        {{ t('settings.privacy.read-receipts-update-error') }}
      </div>
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
