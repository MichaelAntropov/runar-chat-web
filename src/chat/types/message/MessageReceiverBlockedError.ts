export class MessageReceiverBlockedError extends Error {
  constructor() {
    super('Cannot send a message to a user you have blocked')
    this.name = 'MessageReceiverBlockedError'
  }
}
