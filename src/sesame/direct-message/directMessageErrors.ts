export class DirectMessageSessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DirectMessageSessionError'
  }
}
