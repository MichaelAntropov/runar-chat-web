<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { sessionsApi } from '@/auth/api/sessionsApi'
import type { DeviceSession } from '@/auth/types/DeviceSessions'
import { useDeviceStore } from '@/device/deviceStore'
import { useUserStore } from '@/user/userStore'

import RemoveDeviceModal from './RemoveDeviceModal.vue'
import RenameDeviceModal from './RenameDeviceModal.vue'

const { t } = useI18n()

const deviceStore = useDeviceStore()
const userStore = useUserStore()

const sessions = ref<DeviceSession[]>([])
const isLoading = ref(true)
const selectedDevice = ref<DeviceSession | null>(null)
const isRenameModalOpen = ref(false)
const isRemoveModalOpen = ref(false)
const deviceActionNoticeKey = ref<string | null>(null)
const currentTime = ref(Date.now())

const DEVICE_REMOVAL_MINIMUM_AGE_MS = 24 * 60 * 60 * 1000
let eligibilityTimer: number | undefined

onMounted(() => {
  void loadSessions()
  eligibilityTimer = window.setInterval(() => {
    currentTime.value = Date.now()
  }, 30_000)
})

onUnmounted(() => {
  if (eligibilityTimer !== undefined) {
    window.clearInterval(eligibilityTimer)
  }
})

async function loadSessions() {
  isLoading.value = true

  try {
    const response = await sessionsApi.getDeviceSessions()
    sessions.value = response.deviceSessions
  } catch (error) {
    console.error('Failed to fetch device sessions:', error)
  } finally {
    isLoading.value = false
  }
}

const currentDevice = computed(() =>
  sessions.value.find((s) => s.deviceId === deviceStore.deviceId),
)

const otherDevices = computed(() =>
  sessions.value.filter((s) => s.deviceId !== deviceStore.deviceId),
)

function openRenameModal(device: DeviceSession) {
  deviceActionNoticeKey.value = null
  selectedDevice.value = device
  isRenameModalOpen.value = true
}

function updateRenameModal(open: boolean) {
  isRenameModalOpen.value = open
  if (!open) selectedDevice.value = null
}

function handleDeviceRenamed(deviceId: string, deviceName: string) {
  const device = sessions.value.find((session) => session.deviceId === deviceId)
  if (device) device.deviceName = deviceName
}

function openRemoveModal(device: DeviceSession) {
  deviceActionNoticeKey.value = null
  selectedDevice.value = device
  isRemoveModalOpen.value = true
}

function updateRemoveModal(open: boolean) {
  isRemoveModalOpen.value = open
  if (!open) selectedDevice.value = null
}

function handleDeviceRemoved(deviceId: string) {
  sessions.value = sessions.value.filter((session) => session.deviceId !== deviceId)
  deviceActionNoticeKey.value = 'settings.devices.remove-success'
  updateRemoveModal(false)
}

async function handleDeviceUnavailable() {
  await loadSessions()
  deviceActionNoticeKey.value = 'settings.devices.remove-unavailable'
  updateRemoveModal(false)
}

function handleUnauthorized() {
  updateRemoveModal(false)
  userStore.clearLocalAuthState()
}

function parseSessionDate(dateString: string | null): Date | null {
  if (!dateString) return null

  const date = new Date(dateString)

  return Number.isNaN(date.getTime()) ? null : date
}

function isCurrentDeviceRemovalEligible(): boolean {
  const registeredAt = parseSessionDate(currentDevice.value?.registeredAt ?? null)
  if (!registeredAt) return false

  return currentTime.value - registeredAt.getTime() >= DEVICE_REMOVAL_MINIMUM_AGE_MS
}

function isCurrentDeviceRemovalEligibleOnSubmit(): boolean {
  currentTime.value = Date.now()
  return isCurrentDeviceRemovalEligible()
}

// Helper to format dates and handle null values
const formatDate = (dateString: string | null) => {
  if (!dateString) return '-'

  const date = new Date(dateString)

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
  <div class="devices-settings-panel d-flex flex-column w-100 h-100 flex-shrink-0">
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
          <div class="dropdown d-flex flex-shrink-0">
            <button type="button" class="btn btn-more" data-bs-toggle="dropdown">
              <i class="bi bi-three-dots-vertical btn-more__icon"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li>
                <button
                  type="button"
                  class="dropdown-item"
                  @click="currentDevice && openRenameModal(currentDevice)"
                >
                  <i class="bi bi-pencil me-2"></i>
                  {{ t('settings.devices.rename') }}
                </button>
              </li>
            </ul>
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

    <div v-if="deviceActionNoticeKey" class="alert alert-info mx-2 mb-2" role="status">
      {{ t(deviceActionNoticeKey) }}
    </div>

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
            <div class="dropdown d-flex flex-shrink-0">
              <button type="button" class="btn btn-more" data-bs-toggle="dropdown">
                <i class="bi bi-three-dots-vertical btn-more__icon"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li>
                  <button type="button" class="dropdown-item" @click="openRenameModal(device)">
                    <i class="bi bi-pencil me-2"></i>
                    {{ t('settings.devices.rename') }}
                  </button>
                </li>
                <li><hr class="dropdown-divider" /></li>
                <li>
                  <button
                    type="button"
                    class="dropdown-item"
                    :class="{ 'text-danger': isCurrentDeviceRemovalEligible() }"
                    :disabled="!isCurrentDeviceRemovalEligible()"
                    :title="
                      !isCurrentDeviceRemovalEligible()
                        ? t('settings.devices.remove-too-soon')
                        : undefined
                    "
                    @click="openRemoveModal(device)"
                  >
                    <i class="bi bi-trash me-2"></i>
                    {{ t('settings.devices.remove') }}
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </template>

    <RenameDeviceModal
      :device="selectedDevice"
      :open="isRenameModalOpen"
      @update:open="updateRenameModal"
      @renamed="handleDeviceRenamed"
    />
    <RemoveDeviceModal
      :device="selectedDevice"
      :open="isRemoveModalOpen"
      :is-removal-eligible="isCurrentDeviceRemovalEligibleOnSubmit"
      @update:open="updateRemoveModal"
      @removed="handleDeviceRemoved"
      @unavailable="handleDeviceUnavailable"
      @unauthorized="handleUnauthorized"
    />
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
