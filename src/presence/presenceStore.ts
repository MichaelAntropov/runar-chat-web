import { useConnectionStore } from '@/connection/connectionStore'
import { useContactsStore } from '@/contacts/contactStore'
import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import { presenceApi } from './presenceApi'
import type { PresenceUpdate } from './types/PresenceUpdate'

export const usePresenceStore = defineStore('presence', () => {
  const connectionStore = useConnectionStore()
  const contactsStore = useContactsStore()

  const presenceMap: Ref<Map<string, PresenceUpdate>> = ref(new Map())
  const subscribedUserIds: Ref<string[]> = ref([])

  async function subscribeToUsers(userIds: string[]) {
    subscribedUserIds.value = userIds

    if (connectionStore.webSocketConnectionStatus !== 'connected') {
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

  function handlePresenceUpdate(update: PresenceUpdate) {
    presenceMap.value.set(update.userId, update)
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
    handlePresenceUpdate,
  }
})
