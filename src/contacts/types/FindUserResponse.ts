export interface FindUserResponse {
  foundUsers: Array<FoundUser>
}

export interface FoundUser {
  id: string
  username: string
}
