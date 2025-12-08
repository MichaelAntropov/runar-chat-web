import type { ApiError } from './ApiError'

export interface ApiErrorResponse {
  errors: Array<ApiError>
}
