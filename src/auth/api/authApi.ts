import { isAxiosError } from 'axios'

import { http } from '@/core/api/httpClient'

import type { AuthRequest } from '../types/AuthRequest'
import type { AuthResponse } from '../types/AuthResponse'
import type { AuthUpgradeRequest } from '../types/AuthUpgradeRequest'
import type { AuthUpgradeResponse } from '../types/AuthUpgradeResponse'
import { NotAuthorizedError } from '../types/NotAuthorizedError'
import type { RefreshResponse } from '../types/RefreshResponse'

export const authApi = {
  async postAuth(payload: AuthRequest): Promise<AuthResponse> {
    try {
      const response = await http.post<AuthResponse>('/api/v1/auth', payload)
      return response.data
    } catch (error) {
      if (isAxiosError(error) && error.response && error.response.data) {
        if (error.status === 401) {
          throw new NotAuthorizedError()
        }
      } else if (isAxiosError(error)) {
        if (error.status === 401) {
          throw new NotAuthorizedError()
        }
      }

      throw error
    }
  },

  async postUpgradeAuth(
    payload: AuthUpgradeRequest,
    upgradeToken: string,
  ): Promise<AuthUpgradeResponse> {
    const response = await fetch('/api/v1/auth/upgrade-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + upgradeToken,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    return response.json()
  },

  async postRefreshToken(refreshToken: string): Promise<RefreshResponse> {
    const response = await fetch('/api/v1/auth/refresh-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + refreshToken,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    return response.json()
  },

  async postLogout(refreshToken: string): Promise<void> {
    const response = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + refreshToken,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }
  },
}
