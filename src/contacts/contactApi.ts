import { http } from '@/core/api/httpClient'
import type { FoundUser } from './types/FindUserResponse'
import type { AxiosPromise } from 'axios'

export const contactApi = {
  async getUserByUserId(userId: string): AxiosPromise<FoundUser> {
    return await http.get<FoundUser>(`/api/v1/contacts/find/${userId}`)
  },
}
