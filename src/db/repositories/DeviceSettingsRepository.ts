import { DEVICE_SETTINGS_STORE, DEVICE_SETTINGS_STORE_KEY } from '@/db/RunarDB'
import type { DeviceSettings } from '@/settings/types/DeviceSettings'
import type { ReadReceiptMode } from '@/settings/types/ReadReceiptMode'

import { useDbStore } from '../dbStore'

export class DeviceSettingsRepository {
  private get db() {
    return useDbStore().db
  }

  async getSettings(): Promise<DeviceSettings | undefined> {
    return this.db[DEVICE_SETTINGS_STORE].get(DEVICE_SETTINGS_STORE_KEY)
  }

  async saveSettings(readReceiptMode: ReadReceiptMode): Promise<string> {
    return this.db[DEVICE_SETTINGS_STORE].put({
      id: DEVICE_SETTINGS_STORE_KEY,
      readReceiptMode,
    })
  }
}

export const deviceSettingsRepository = new DeviceSettingsRepository()
