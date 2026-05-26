import { http } from '@/core/api/httpClient'
import type { PresenceUpdate } from './types/PresenceUpdate'

export const presenceApi = {
  async subscribe(userIds: string[]): Promise<void> {
    await http.post('/api/v1/presence/subscribe', { userIds })
  },

  async pollStatuses(userIds: string[]): Promise<PresenceUpdate[]> {
    const res = await http.post<{ userPresenceStatuses: PresenceUpdate[] }>(
      '/api/v1/presence/users',
      { userIds },
    )
    return res.data.userPresenceStatuses
  },
}
