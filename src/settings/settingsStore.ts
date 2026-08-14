import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'

import { useDbStore } from '@/db/dbStore'
import { deviceSettingsRepository } from '@/db/repositories/DeviceSettingsRepository'
import { pendingReadReceiptRepository } from '@/db/repositories/PendingReadReceiptRepository'
import { useUserStore } from '@/user/userStore'

import { settingsApi } from './settingsApi'
import type { OnlineVisibility } from './types/OnlineVisibility'

export const useSettingsStore = defineStore('settings', () => {
  const userStore = useUserStore()
  const dbStore = useDbStore()

  const onlineVisibility: Ref<OnlineVisibility | null> = ref(null)
  const readReceiptsEnabled: Ref<boolean | null> = ref(null)

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
      readReceiptsEnabled.value = false
      return
    }

    deviceSettingsPromise = (async () => {
      try {
        const settings = await deviceSettingsRepository.getSettings()
        if (settings) {
          readReceiptsEnabled.value = settings.readReceiptsEnabled
        } else {
          await deviceSettingsRepository.saveSettings(true)
          readReceiptsEnabled.value = true
        }

        if (!readReceiptsEnabled.value) {
          await pendingReadReceiptRepository.clear()
        }
      } catch (error) {
        console.error('[settingsStore] Failed to load device settings:', error)
        readReceiptsEnabled.value = false
      } finally {
        deviceSettingsPromise = null
      }
    })()

    return deviceSettingsPromise
  }

  async function ensureReadReceiptsLoaded(): Promise<boolean> {
    if (readReceiptsEnabled.value === null) {
      await loadDeviceSettings()
    }
    return readReceiptsEnabled.value === true
  }

  async function updateReadReceiptsEnabled(value: boolean): Promise<void> {
    if (dbStore.dbStatus !== 'ready') {
      throw new Error('Cannot update read receipts before the local database is ready')
    }

    if (value) {
      // Never revive receipts that were read while this setting was disabled.
      await pendingReadReceiptRepository.clear()
    }

    await deviceSettingsRepository.saveSettings(value)
    readReceiptsEnabled.value = value

    if (!value) {
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
        readReceiptsEnabled.value = null
        deviceSettingsPromise = null
      }
    },
    { immediate: true },
  )

  return {
    onlineVisibility,
    readReceiptsEnabled,
    ensureReadReceiptsLoaded,
    fetchSettings,
    loadDeviceSettings,
    updateSettings,
    updateReadReceiptsEnabled,
  }
})
