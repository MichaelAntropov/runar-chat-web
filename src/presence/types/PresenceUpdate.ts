export interface PresenceUpdate {
  userId: string
  isOnline: boolean | null
  lastActiveAt: string | null
}
