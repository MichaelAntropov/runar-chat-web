<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { sessionsApi } from '@/auth/api/sessionsApi'
import { useDeviceStore } from '@/device/deviceStore'
import type { DeviceSession } from '@/auth/types/DeviceSessions'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const deviceStore = useDeviceStore()

const sessions = ref<DeviceSession[]>([])
const isLoading = ref(true)

onMounted(async () => {
  try {
    const response = await sessionsApi.getDeviceSessions()
    sessions.value = response.deviceSessions
  } catch (error) {
    console.error('Failed to fetch device sessions:', error)
  } finally {
    isLoading.value = false
  }
})

const currentDevice = computed(() =>
  sessions.value.find((s) => s.deviceId === deviceStore.deviceId),
)

const otherDevices = computed(() =>
  sessions.value.filter((s) => s.deviceId !== deviceStore.deviceId),
)

// Helper to format dates, handles null values and forces UTC parsing
const formatDate = (dateString: string | null) => {
  if (!dateString) return '-'

  // If the server string is missing the 'Z' (UTC marker), append it
  // This forces JS to treat the parsed string as UTC rather than local time
  const utcString = dateString.endsWith('Z') ? dateString : `${dateString}Z`

  const date = new Date(utcString)

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}
</script>

<template>
  <div class="d-flex flex-column">
    <p class="m-2 p-3 pb-0 pt-0 fs-6 fw-medium">{{ t('settings.devices.this-device') }}</p>

    <div v-if="currentDevice" class="card m-2">
      <div class="card-body">
        <div class="d-flex">
          <div class="flex-grow-1">
            <p v-if="currentDevice.deviceName" class="fw-bold">
              {{ currentDevice.deviceName }}
            </p>
            <p v-else class="fw-normal fst-italic text-body-tertiary">
              {{ t('settings.devices.no-name') }}
            </p>
            <div class="d-flex">
              <small class="m-0 me-2 text-body-secondary">{{
                t('settings.devices.registered-at')
              }}</small>
              <small class="m-0 text-body-secondary">{{
                formatDate(currentDevice.registeredAt)
              }}</small>
            </div>
            <div class="d-flex">
              <small class="m-0 me-2 text-body-secondary">{{
                t('settings.devices.last-connection-at')
              }}</small>
              <small class="m-0 text-body-secondary">{{
                formatDate(currentDevice.lastActiveAt)
              }}</small>
            </div>
          </div>
          <div class="d-flex flex-shrink-0">
            <button class="btn btn-more">
              <i class="bi bi-three-dots-vertical btn-more__icon"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
    <p
      v-else-if="!isLoading"
      class="d-flex justify-content-center text-body-tertiary fst-italic m-0 mt-2 mb-2"
    >
      {{ t('settings.devices.not-found') }}
    </p>

    <p class="m-2 p-3 pb-0 fs-6 fw-medium uppercase">{{ t('settings.devices.other-devices') }}</p>

    <p
      v-if="!isLoading && otherDevices.length === 0"
      class="d-flex justify-content-center text-body-tertiary fst-italic m-0"
    >
      {{ t('settings.devices.no-other') }}
    </p>

    <template v-else>
      <div v-for="device in otherDevices" :key="device.deviceId" class="card m-2">
        <div class="card-body">
          <div class="d-flex">
            <div class="flex-grow-1">
              <p v-if="device.deviceName" class="fw-bold">
                {{ device.deviceName }}
              </p>
              <p v-else class="fw-normal fst-italic text-body-tertiary">
                {{ t('settings.devices.no-name') }}
              </p>
              <div class="d-flex">
                <small class="m-0 me-2 text-body-secondary">{{
                  t('settings.devices.registered-at')
                }}</small>
                <small class="m-0 text-body-secondary">{{ formatDate(device.registeredAt) }}</small>
              </div>
              <div class="d-flex">
                <small class="m-0 me-2 text-body-secondary">{{
                  t('settings.devices.last-connection-at')
                }}</small>
                <small class="m-0 text-body-secondary">{{ formatDate(device.lastActiveAt) }}</small>
              </div>
            </div>
            <div class="d-flex flex-shrink-0">
              <button class="btn btn-more">
                <i class="bi bi-three-dots-vertical btn-more__icon"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.btn-more {
  padding: 0.375rem 0.5rem;
  line-height: 1;
}

.btn-more__icon {
  font-size: 1.4rem;
  line-height: 1;
}

.btn-more:hover {
  background-color: var(--bs-secondary-bg);
}
</style>
