import type { FieldError } from './FieldError'

export class DataValidationError extends Error {
  public fieldErrors: Array<FieldError>

  constructor(fieldErrors: Array<FieldError>) {
    super(`Validation constraints were violated for ${fieldErrors.length} fields`)
    this.name = 'DataValidationError'
    this.fieldErrors = fieldErrors
  }
}
