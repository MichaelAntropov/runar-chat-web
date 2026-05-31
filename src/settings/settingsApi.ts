import { http } from '@/core/api/httpClient'
import type { OnlineVisibility } from './types/OnlineVisibility'

export interface SettingsResponse {
  onlineVisibility: OnlineVisibility
}

export const settingsApi = {
  async getSettings(): Promise<SettingsResponse> {
    const res = await http.get<SettingsResponse>('/api/v1/user/settings')
    return res.data
  },

  async updateSettings(onlineVisibility: OnlineVisibility): Promise<SettingsResponse> {
    const res = await http.post<SettingsResponse>('/api/v1/user/settings', {
      onlineVisibility,
    })
    return res.data
  },
}
