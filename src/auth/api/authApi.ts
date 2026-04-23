import { http } from '@/core/api/httpClient'
import type { AuthRequest } from '../types/AuthRequest'
import type { AuthResponse } from '../types/AuthResponse'
import { isAxiosError } from 'axios'
import { NotAuthorizedError } from '../types/NotAuthorizedError'

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
}
