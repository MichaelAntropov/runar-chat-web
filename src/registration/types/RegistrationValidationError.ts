export class RegistrationValidationError extends Error {
  public messageCode: string

  constructor(messageCode: string) {
    super(messageCode)
    this.name = 'RegistrationValidationError'
    this.messageCode = messageCode
  }
}
