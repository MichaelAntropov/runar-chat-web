export class DoubleRatchetAuthenticationError extends Error {
  constructor() {
    super('Double Ratchet payload authentication failed')
    this.name = 'DoubleRatchetAuthenticationError'
  }
}
