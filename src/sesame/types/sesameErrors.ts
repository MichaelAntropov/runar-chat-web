export class SesameInvalidStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SesameInvalidStateError'
  }
}

export class SesameLimitExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SesameLimitExceededError'
  }
}

export class SesameSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Sesame session not found: ${sessionId}`)
    this.name = 'SesameSessionNotFoundError'
  }
}
