import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'

import { useDbStore } from '@/db/dbStore'
import { deviceSettingsRepository } from '@/db/repositories/DeviceSettingsRepository'
import { pendingReadReceiptRepository } from '@/db/repositories/PendingReadReceiptRepository'
import { useUserStore } from '@/user/userStore'

import { settingsApi } from './settingsApi'
import type { OnlineVisibility } from './types/OnlineVisibility'
import type { ReadReceiptMode } from './types/ReadReceiptMode'

export const useSettingsStore = defineStore('settings', () => {
  const userStore = useUserStore()
  const dbStore = useDbStore()

  const onlineVisibility: Ref<OnlineVisibility | null> = ref(null)
  const readReceiptMode: Ref<ReadReceiptMode | null> = ref(null)

  let fetchPromise: Promise<void> | null = null
  let deviceSettingsPromise: Promise<void> | null = null

  async function fetchSettings() {
    if (fetchPromise) return fetchPromise

    fetchPromise = (async () => {
      try {
        const response = await settingsApi.getSettings()
        onlineVisibility.value = response.onlineVisibility
      } catch (error) {
        console.error('[settingsStore] Failed to fetch settings:', error)
      } finally {
        fetchPromise = null
      }
    })()

    return fetchPromise
  }

  async function updateSettings(value: OnlineVisibility) {
    const response = await settingsApi.updateSettings(value)
    onlineVisibility.value = response.onlineVisibility
  }

  async function loadDeviceSettings(): Promise<void> {
    if (deviceSettingsPromise) return deviceSettingsPromise
    if (dbStore.dbStatus !== 'ready') {
      readReceiptMode.value = 'NONE'
      return
    }

    deviceSettingsPromise = (async () => {
      try {
        const settings = await deviceSettingsRepository.getSettings()
        const storedMode = settings?.readReceiptMode
        const normalizedMode: ReadReceiptMode =
          storedMode === 'ALL' || storedMode === 'NONE' || storedMode === 'PER_USER'
            ? storedMode
            : 'ALL'

        readReceiptMode.value = normalizedMode
        if (!settings || storedMode !== normalizedMode) {
          await deviceSettingsRepository.saveSettings(normalizedMode)
        }

        if (normalizedMode === 'NONE') {
          await pendingReadReceiptRepository.clear()
        }
      } catch (error) {
        console.error('[settingsStore] Failed to load device settings:', error)
        readReceiptMode.value = 'NONE'
      } finally {
        deviceSettingsPromise = null
      }
    })()

    return deviceSettingsPromise
  }

  async function ensureReadReceiptModeLoaded(): Promise<ReadReceiptMode> {
    if (readReceiptMode.value === null) {
      await loadDeviceSettings()
    }
    return readReceiptMode.value ?? 'NONE'
  }

  async function updateReadReceiptMode(value: ReadReceiptMode): Promise<void> {
    if (dbStore.dbStatus !== 'ready') {
      throw new Error('Cannot update read receipts before the local database is ready')
    }

    await deviceSettingsRepository.saveSettings(value)
    readReceiptMode.value = value

    if (value === 'NONE') {
      try {
        await pendingReadReceiptRepository.clear()
      } catch (error) {
        // Keep the privacy setting disabled even if cleanup needs another attempt on reload.
        console.error('[settingsStore] Failed to clear pending read receipts:', error)
      }
    }
  }

  watch(
    () => userStore.authStatus,
    (status) => {
      if (status === 'upgraded') {
        fetchSettings()
      } else {
        onlineVisibility.value = null
      }
    },
    { immediate: true },
  )

  watch(
    () => dbStore.dbStatus,
    (status) => {
      if (status === 'ready') {
        loadDeviceSettings()
      } else {
        readReceiptMode.value = null
        deviceSettingsPromise = null
      }
    },
    { immediate: true },
  )

  return {
    onlineVisibility,
    readReceiptMode,
    ensureReadReceiptModeLoaded,
    fetchSettings,
    loadDeviceSettings,
    updateSettings,
    updateReadReceiptMode,
  }
})
