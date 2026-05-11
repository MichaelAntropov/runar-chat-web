import { http } from '@/core/api/httpClient'
import type { DeviceSessions } from '../types/DeviceSessions'

export const sessionsApi = {
  async getDeviceSessions(): Promise<DeviceSessions> {
    const response = await http.get<DeviceSessions>('/api/v1/session/sessions')
    return response.data
  },
}
