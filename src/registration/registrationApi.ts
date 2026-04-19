import { http } from '@/core/api/httpClient'
import type { RegisterUserRequest } from './types/RegisterUserPayload'
import type { RegisterUserResponse } from './types/RegisterUserResponse'
import { isAxiosError } from 'axios'
import type { ApiErrorResponse } from '@/core/api/types/ApiErrorResponse'
import type { ApiError } from '@/core/api/types/ApiError'
import { DataValidationError } from '@/core/api/types/DataValidationError'
import type { FieldError } from '@/core/api/types/FieldError'
import { RegistrationValidationError } from './types/RegistrationValidationError'

export const registrationApi = {
  async postRegisterUser(payload: RegisterUserRequest): Promise<RegisterUserResponse> {
    try {
      const response = await http.post<RegisterUserResponse>('/api/v1/auth/register', payload)
      return response.data
    } catch (error) {
      if (isAxiosError(error) && error.response && error.response.data) {
        const errorResponse = error.response.data as ApiErrorResponse

        const dataValidationErrors: Array<ApiError> = errorResponse.errors.filter(
          (e) => e.code === 'DATA_VALIDATION',
        )

        if (dataValidationErrors.length !== 0) {
          const fieldErrors = new Array<FieldError>()
          for (const apiError of dataValidationErrors) {
            const fieldError = apiError.data as FieldError
            fieldErrors.push(fieldError)
          }
          throw new DataValidationError(fieldErrors)
        }

        const registrationValidation: ApiError | undefined = errorResponse.errors.find(
          (e) => e.code === 'REGISTRATION_VALIDATION',
        )

        if (registrationValidation) {
          throw new RegistrationValidationError(registrationValidation.message)
        }
      }

      throw error
    }
  },
}
