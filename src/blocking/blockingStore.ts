import { defineStore } from 'pinia'
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

import { useUserStore } from '@/user/userStore'

import { blockingApi } from './blockingApi'
import type { BlockedUser } from './types/BlockedUser'

const PAGE_SIZE = 100

export const useBlockingStore = defineStore('blocking', () => {
  const userStore = useUserStore()

  const blockedUsers: Ref<Array<BlockedUser>> = ref([])
  const isLoading = ref(false)
  const isLoaded = ref(false)
  const loadError: Ref<unknown | null> = ref(null)

  const blockedUserIds: ComputedRef<Set<string>> = computed(
    () => new Set(blockedUsers.value.map((user) => user.id)),
  )

  let fetchPromise: Promise<void> | null = null
  let stateGeneration = 0

  function resetState() {
    stateGeneration++
    blockedUsers.value = []
    isLoading.value = false
    isLoaded.value = false
    loadError.value = null
    fetchPromise = null
  }

  async function fetchBlockedUsers(force = false): Promise<void> {
    if (fetchPromise) return fetchPromise
    if (isLoaded.value && !force) return

    const fetchGeneration = stateGeneration
    isLoading.value = true
    loadError.value = null

    fetchPromise = (async () => {
      try {
        const loadedUsers: BlockedUser[] = []
        let offset = 0
        let hasMore = true

        while (hasMore) {
          const response = await blockingApi.getBlockedUsers(offset, PAGE_SIZE)
          loadedUsers.push(...response.blockedUsers)
          hasMore = response.hasMore

          if (hasMore && response.blockedUsers.length === 0) {
            throw new Error('Blocked users pagination did not advance')
          }

          offset = response.offset + response.blockedUsers.length
        }

        if (fetchGeneration !== stateGeneration || userStore.authStatus !== 'upgraded') return

        blockedUsers.value = loadedUsers
        isLoaded.value = true
      } catch (error) {
        if (fetchGeneration === stateGeneration) {
          loadError.value = error
          isLoaded.value = false
        }
        throw error
      } finally {
        if (fetchGeneration === stateGeneration) {
          isLoading.value = false
          fetchPromise = null
        }
      }
    })()

    return fetchPromise
  }

  async function blockUser(user: Pick<BlockedUser, 'id' | 'username'>): Promise<void> {
    const mutationGeneration = stateGeneration
    await blockingApi.blockUser(user.id)

    if (mutationGeneration !== stateGeneration || userStore.authStatus !== 'upgraded') return

    const existingUser = blockedUsers.value.find((blockedUser) => blockedUser.id === user.id)
    if (existingUser) {
      existingUser.username = user.username
      return
    }

    blockedUsers.value.unshift({
      ...user,
      blockedAt: new Date().toISOString(),
    })
  }

  async function unblockUser(userId: string): Promise<void> {
    const mutationGeneration = stateGeneration
    await blockingApi.unblockUser(userId)

    if (mutationGeneration !== stateGeneration || userStore.authStatus !== 'upgraded') return

    blockedUsers.value = blockedUsers.value.filter((user) => user.id !== userId)
  }

  function isBlocked(userId: string): boolean {
    return blockedUserIds.value.has(userId)
  }

  watch(
    () => userStore.authStatus,
    (status) => {
      if (status === 'upgraded') {
        fetchBlockedUsers().catch((error) => {
          console.error('[blockingStore] Failed to fetch blocked users:', error)
        })
      } else {
        resetState()
      }
    },
    { immediate: true },
  )

  return {
    blockedUsers,
    blockedUserIds,
    isLoading,
    isLoaded,
    loadError,
    fetchBlockedUsers,
    blockUser,
    unblockUser,
    isBlocked,
  }
})
