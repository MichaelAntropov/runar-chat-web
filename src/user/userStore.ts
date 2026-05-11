import { defineStore } from 'pinia'
import { computed, ref, watch, type Ref } from 'vue'
import type { RefreshResponse } from '../auth/types/RefreshResponse'
import type { Principal } from '../auth/types/Principal'
import type { AuthUpgradeRequest } from '@/auth/types/AuthUpgradeRequest'
import type { AuthUpgradeResponse } from '@/auth/types/AuthUpgradeResponse'

export type AuthStatus = 'none' | 'pre-upgrade' | 'upgraded'

export const useUserStore = defineStore('user', () => {
  const authStatus: Ref<AuthStatus> = ref('none')
  const authUpgradeToken: Ref<string> = ref('')
  const refreshToken: Ref<string> = ref('')
  const accessToken: Ref<string> = ref('')
  const principal: Ref<Principal | null> = ref(null)

  const isAuthenticated = computed<boolean>(() =>
    ['pre-upgrade', 'upgraded'].includes(authStatus.value),
  )

  let refreshingTokenPromise: Promise<void> | null = null // Stores the ongoing refresh promise

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
    const result = await postUpgradeAuth({ deviceId })
    localStorage.setItem('refresh-token', result.refreshToken)
    authUpgradeToken.value = ''
    refreshToken.value = result.refreshToken
    accessToken.value = result.accessToken
    authStatus.value = 'upgraded'
  }

  const getAccessToken = async () => {
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

    console.log('Log Out!')
    logOut()
    return ''
  }

  async function postUpgradeAuth(data: AuthUpgradeRequest): Promise<AuthUpgradeResponse> {
    const response = await fetch('/api/v1/auth/upgrade-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + authUpgradeToken.value,
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    return await response.json()
  }

  async function refreshAccessToken() {
    try {
      const response = await fetch('/api/v1/auth/refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + refreshToken.value,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }

      const parsed: RefreshResponse = await response.json()
      accessToken.value = parsed.accessToken
    } catch (error) {
      console.error('Error refreshing access token: ', error)
      console.log('Log Out!')
      logOut()
    }
  }

  async function logOut() {
    try {
      const response = await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + refreshToken.value,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
    } catch (error) {
      console.error('Error logging out: ', error)
      return
    }

    localStorage.removeItem('refresh-token')

    authStatus.value = 'none'
    authUpgradeToken.value = ''
    refreshToken.value = ''
    accessToken.value = ''
    principal.value = null

    console.log('Logged Out!')
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
    authStatus,
    authUpgradeToken,
    refreshToken,
    accessToken,
    principal,
    upgradeAuth,
    getAccessToken,
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
