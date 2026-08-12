import type { BlockedUser } from './BlockedUser'

export interface BlockedUsersResponse {
  blockedUsers: Array<BlockedUser>
  limit: number
  offset: number
  hasMore: boolean
}
