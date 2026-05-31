import { useConnectionStore } from '@/connection/connectionStore'
import { useContactsStore } from '@/contacts/contactStore'
import { useSettingsStore } from '@/settings/settingsStore'
import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import { presenceApi } from './presenceApi'
import type { PresenceUpdate } from './types/PresenceUpdate'

export const usePresenceStore = defineStore('presence', () => {
  const connectionStore = useConnectionStore()
  const contactsStore = useContactsStore()
  const settingsStore = useSettingsStore()

  const presenceMap: Ref<Map<string, PresenceUpdate>> = ref(new Map())
  const subscribedUserIds: Ref<string[]> = ref([])

  async function subscribeToUsers(userIds: string[]) {
    subscribedUserIds.value = userIds

    if (connectionStore.webSocketConnectionStatus !== 'connected') {
      return
    }

    if (settingsStore.onlineVisibility === null) {
      await settingsStore.fetchSettings()
    }

    if (settingsStore.onlineVisibility === 'NONE') {
      return
    }

    try {
      await presenceApi.subscribe(userIds)

      if (userIds.length > 0) {
        const results = await presenceApi.pollStatuses(userIds)
        for (const update of results) {
          if (update.isOnline !== null) {
            presenceMap.value.set(update.userId, update)
          }
        }
      }
    } catch (error) {
      console.error('[presenceStore] subscribeToUsers failed:', error)
    }
  }

  function clearSubscriptions() {
    subscribedUserIds.value = []
    presenceMap.value.clear()
  }

  function handlePresenceUpdate(update: PresenceUpdate) {
    if (update.isOnline === null) {
      presenceMap.value.delete(update.userId)
    } else {
      presenceMap.value.set(update.userId, update)
    }
  }

  watch(
    () => connectionStore.webSocketConnectionStatus,
    (status, oldStatus) => {
      if (status === 'connected' && subscribedUserIds.value.length > 0) {
        subscribeToUsers(subscribedUserIds.value)
      }

      if (oldStatus === 'connected' && status !== 'connected') {
        presenceMap.value.clear()
      }
    },
  )

  watch(
    () => contactsStore.isHydrated && contactsStore.contacts.length > 0,
    (ready) => {
      if (ready) {
        const ids = contactsStore.contacts.map((c) => c.userId)
        subscribeToUsers(ids)
      }
    },
    { immediate: true },
  )

  return {
    presenceMap,
    subscribedUserIds,
    subscribeToUsers,
    clearSubscriptions,
    handlePresenceUpdate,
  }
})
