import { defineStore } from 'pinia'
import { computed, ref, watch, type Ref } from 'vue'

import { authApi } from '@/auth/api/authApi'

import type { Principal } from '../auth/types/Principal'

export type AuthStatus = 'none' | 'pre-upgrade' | 'upgraded'

const DEVICE_REMOVED_NOTICE_KEY = 'device-removed-notice'

export const useUserStore = defineStore('user', () => {
  const authStatus: Ref<AuthStatus> = ref('none')
  const authUpgradeToken: Ref<string> = ref('')
  const refreshToken: Ref<string> = ref('')
  const accessToken: Ref<string> = ref('')
  const principal: Ref<Principal | null> = ref(null)

  const isAuthenticated = computed<boolean>(() =>
    ['pre-upgrade', 'upgraded'].includes(authStatus.value),
  )
  const authenticatedDeviceId = computed<string | null>(() => {
    const token = refreshToken.value || accessToken.value
    return token ? getDeviceIdFromJwtToken(token) : null
  })

  let refreshingTokenPromise: Promise<void> | null = null // Stores the ongoing refresh promise
  let loggingOutPromise: Promise<void> | null = null
  let authStateGeneration = 0

  function setRefreshTokenFromStorage() {
    const storedRefreshToken = localStorage.getItem('refresh-token') as string | null
    if (storedRefreshToken && storedRefreshToken !== '' && !isExpiredToken(storedRefreshToken)) {
      refreshToken.value = storedRefreshToken
      authStatus.value = 'upgraded'
    } else {
      localStorage.removeItem('refresh-token')
    }
  }

  function logIn(upgradeAuthToken: string) {
    authUpgradeToken.value = upgradeAuthToken
    authStatus.value = 'pre-upgrade'
  }

  async function upgradeAuth(deviceId: string) {
    const result = await authApi.postUpgradeAuth({ deviceId }, authUpgradeToken.value)
    localStorage.setItem('refresh-token', result.refreshToken)
    authUpgradeToken.value = ''
    refreshToken.value = result.refreshToken
    accessToken.value = result.accessToken
    authStatus.value = 'upgraded'
  }

  async function getAccessToken(): Promise<string> {
    if (loggingOutPromise) {
      await loggingOutPromise
      return ''
    }

    if (accessToken.value !== '' && !isExpiredToken(accessToken.value)) {
      return accessToken.value
    }

    // If a refresh is already in progress, return the same promise
    if (refreshToken.value !== '' && !isExpiredToken(refreshToken.value)) {
      if (!refreshingTokenPromise) {
        refreshingTokenPromise = refreshAccessToken().finally(() => {
          refreshingTokenPromise = null // Reset after completion
        })
      }

      await refreshingTokenPromise // Wait for the ongoing refresh
      return accessToken.value
    }

    clearLocalAuthState()
    return ''
  }

  async function refreshAccessToken(): Promise<void> {
    const requestGeneration = authStateGeneration

    try {
      const parsed = await authApi.postRefreshToken(refreshToken.value)
      if (requestGeneration !== authStateGeneration || authStatus.value === 'none') return

      accessToken.value = parsed.accessToken
    } catch (error) {
      console.error('Error refreshing access token: ', error)
      clearLocalAuthState()
    }
  }

  function clearLocalAuthState(): void {
    authStateGeneration++
    localStorage.removeItem('refresh-token')

    authStatus.value = 'none'
    authUpgradeToken.value = ''
    refreshToken.value = ''
    accessToken.value = ''
    principal.value = null
  }

  function handleDeviceRemoved(): void {
    localStorage.setItem(DEVICE_REMOVED_NOTICE_KEY, '1')
    clearLocalAuthState()
  }

  function consumeDeviceRemovedNotice(): boolean {
    const hasNotice = localStorage.getItem(DEVICE_REMOVED_NOTICE_KEY) === '1'
    localStorage.removeItem(DEVICE_REMOVED_NOTICE_KEY)
    return hasNotice
  }

  async function logOut(): Promise<void> {
    if (loggingOutPromise) return loggingOutPromise

    const refreshTokenForLogout = refreshToken.value
    loggingOutPromise = (async () => {
      try {
        if (refreshingTokenPromise) {
          await refreshingTokenPromise
        }

        const token = refreshTokenForLogout || refreshToken.value
        if (!token) return

        await authApi.postLogout(token)
      } catch (error) {
        console.error('Error logging out: ', error)
      } finally {
        clearLocalAuthState()
        console.log('Logged Out!')
      }
    })().finally(() => {
      loggingOutPromise = null
    })

    return loggingOutPromise
  }

  watch(authUpgradeToken, () => {
    if (isAuthenticated.value && !principal.value) {
      principal.value = createPrincipalFromJwtToken(authUpgradeToken.value)
    }
  })

  watch(refreshToken, () => {
    if (isAuthenticated.value && !principal.value) {
      principal.value = createPrincipalFromJwtToken(refreshToken.value)
    }
  })

  setRefreshTokenFromStorage()

  return {
    isAuthenticated,
    authenticatedDeviceId,
    authStatus,
    authUpgradeToken,
    refreshToken,
    accessToken,
    principal,
    upgradeAuth,
    getAccessToken,
    clearLocalAuthState,
    handleDeviceRemoved,
    consumeDeviceRemovedNotice,
    logIn,
    signOut: logOut,
  }
})

function isExpiredToken(token: string): boolean {
  const arrayToken = token.split('.')
  const decoded = JSON.parse(atob(arrayToken[1]))

  if (decoded.exp === undefined || decoded.exp === null) {
    return true
  }

  const decodedExpTime: number = Number.parseInt(decoded.exp)
  return Math.floor(new Date().getTime() / 1000) >= decodedExpTime
}

function createPrincipalFromJwtToken(token: string): Principal | null {
  const arrayToken = token.split('.')
  const decoded = JSON.parse(atob(arrayToken[1]))

  if (decoded.exp === undefined || decoded.exp === null) {
    return null
  }

  const newPrincipal: Principal = {
    id: decoded.sub,
    name: decoded.upn,
  }

  return newPrincipal
}

export function getDeviceIdFromJwtToken(token: string): string | null {
  try {
    const encodedPayload = token.split('.')[1]
    if (!encodedPayload) return null

    const normalized = encodedPayload.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded: unknown = JSON.parse(atob(padded))
    if (!decoded || typeof decoded !== 'object') return null

    const deviceId = (decoded as Record<string, unknown>).deviceId
    return typeof deviceId === 'string' && deviceId.length > 0 ? deviceId : null
  } catch {
    return null
  }
}
