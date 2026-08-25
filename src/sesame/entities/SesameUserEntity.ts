export interface SesameUser {
  userId: string
  staleSince: number | null
  entityVersion: number
}
