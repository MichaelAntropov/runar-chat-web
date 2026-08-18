import { http } from '@/core/api/httpClient'

import type { RenameDeviceRequest } from './types/RenameDeviceRequest'

export const deviceApi = {
  async renameDevice(deviceId: string, payload: RenameDeviceRequest): Promise<void> {
    await http.put(`/api/v1/device/${deviceId}/name`, payload)
  },
}
