export class SesameConcurrentModificationError extends Error {
  constructor(userId: string) {
    super(`Sesame state changed concurrently for user ${userId}`)
    this.name = 'SesameConcurrentModificationError'
  }
}
