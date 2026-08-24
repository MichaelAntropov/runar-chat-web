export class DoubleRatchetAuthenticationError extends Error {
  constructor() {
    super('Double Ratchet payload authentication failed')
    this.name = 'DoubleRatchetAuthenticationError'
  }
}

export class DoubleRatchetStaleMessageError extends Error {
  constructor() {
    super('Double Ratchet message key is no longer available')
    this.name = 'DoubleRatchetStaleMessageError'
  }
}

export class DoubleRatchetTooManySkippedMessagesError extends Error {
  constructor() {
    super('Double Ratchet skipped-message limit exceeded')
    this.name = 'DoubleRatchetTooManySkippedMessagesError'
  }
}
