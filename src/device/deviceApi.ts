import { http } from '@/core/api/httpClient'

import type { RenameDeviceRequest } from './types/RenameDeviceRequest'

export const deviceApi = {
  async removeDevice(deviceId: string): Promise<void> {
    await http.delete(`/api/v1/device/${deviceId}`)
  },

  async renameDevice(deviceId: string, payload: RenameDeviceRequest): Promise<void> {
    await http.put(`/api/v1/device/${deviceId}/name`, payload)
  },
}
