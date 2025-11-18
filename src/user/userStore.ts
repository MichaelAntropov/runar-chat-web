import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import type { RefreshResponse } from '../auth/types/RefreshResponse'
import type { Principal } from '../auth/types/Principal'

export const useUserStore = defineStore('user', () => {
  const isAuthenticated: Ref<boolean> = ref(false)
  const refreshToken: Ref<string> = ref('')
  const accessToken: Ref<string> = ref('')
  const principal: Ref<Principal | null> = ref(null)

  let refreshingTokenPromise: Promise<void> | null = null // Stores the ongoing refresh promise

  const getAccessToken = async () => {
    // console.log('getAccessToken()')

    if (accessToken.value !== '' && !isExpiredToken(accessToken.value)) {
      // console.log('Access token is still valid!')
      return accessToken.value
    }

    // If a refresh is already in progress, return the same promise
    if (refreshToken.value !== '' && !isExpiredToken(refreshToken.value)) {
      // console.log('Access token expired! Get new one with refresh token...')

      if (!refreshingTokenPromise) {
        refreshingTokenPromise = refreshAccessToken().finally(() => {
          refreshingTokenPromise = null // Reset after completion
        })
      }

      await refreshingTokenPromise // Wait for the ongoing refresh
      return accessToken.value
    }

    console.log('Log Out!')
    signOut()
    return ''
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
      signOut()
    }
  }

  async function signOut() {
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

    isAuthenticated.value = false
    refreshToken.value = ''
    accessToken.value = ''

    console.log('Logged Out!')
  }

  watch(refreshToken, () => {
    if (!principal.value) {
      principal.value = createPrincipalFromJwtToken(refreshToken.value)
    }
  })

  return {
    isAuthenticated,
    refreshToken,
    accessToken,
    principal,
    getAccessToken,
    signOut,
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
    name: decoded,
  }

  return newPrincipal
}
