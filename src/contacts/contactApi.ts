import type { AxiosPromise } from 'axios'

import { http } from '@/core/api/httpClient'

import type { FindUserResponse, FoundUser } from './types/FindUserResponse'

export const contactApi = {
  async findUsersByUsername(username: string): Promise<FindUserResponse> {
    const response = await http.get<FindUserResponse>('/api/v1/contacts/find', {
      params: { username },
    })
    return response.data
  },

  async getUserByUserId(userId: string): AxiosPromise<FoundUser> {
    return await http.get<FoundUser>(`/api/v1/contacts/find/${userId}`)
  },
}
