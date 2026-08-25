import { http } from '@/core/api/httpClient'

import type { RenameDeviceRequest } from './types/RenameDeviceRequest'
import type { RegisterDeviceRequest } from './types/RegisterDeviceRequest'
import type { RegisterDeviceResponse } from './types/RegisterDeviceResponses'

export const deviceApi = {
  async registerDevice(
    payload: RegisterDeviceRequest,
    upgradeToken: string
  ): Promise<RegisterDeviceResponse> {
    const response = await fetch('/api/v1/device/register-device', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${upgradeToken}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Device registration failed with status ${response.status}.`)
    }

    return response.json()
  },

  async removeDevice(deviceId: string): Promise<void> {
    await http.delete(`/api/v1/device/${deviceId}`)
  },

  async renameDevice(deviceId: string, payload: RenameDeviceRequest): Promise<void> {
    await http.put(`/api/v1/device/${deviceId}/name`, payload)
  },
}
