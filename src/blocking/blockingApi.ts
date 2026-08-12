import { http } from '@/core/api/httpClient'

import type { BlockedUsersResponse } from './types/BlockedUsersResponse'

export const blockingApi = {
  async getBlockedUsers(offset: number, limit: number): Promise<BlockedUsersResponse> {
    const response = await http.get<BlockedUsersResponse>('/api/v1/user/blocks', {
      params: { offset, limit },
    })
    return response.data
  },

  async blockUser(userId: string): Promise<void> {
    await http.put(`/api/v1/user/blocks/${userId}`)
  },

  async unblockUser(userId: string): Promise<void> {
    await http.delete(`/api/v1/user/blocks/${userId}`)
  },
}
