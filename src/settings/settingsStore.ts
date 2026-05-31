import { useUserStore } from '@/user/userStore'
import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import { settingsApi } from './settingsApi'
import type { OnlineVisibility } from './types/OnlineVisibility'

export const useSettingsStore = defineStore('settings', () => {
  const userStore = useUserStore()

  const onlineVisibility: Ref<OnlineVisibility | null> = ref(null)

  let fetchPromise: Promise<void> | null = null

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

  return {
    onlineVisibility,
    fetchSettings,
    updateSettings,
  }
})
