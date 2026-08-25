import { defineStore } from 'pinia'
import { computed, ref, watch, type Ref } from 'vue'

import { StoredDeviceUnavailableError } from '@/auth/types/StoredDeviceUnavailableError'
import { useDbStore } from '@/db/dbStore'
import { useUserStore } from '@/user/userStore'

import { deviceApi } from './deviceApi'
import { getDeviceLabel } from './deviceLabel'
import { DeviceRegistrationService } from './deviceRegistrationService'
import { LocalDeviceRepository } from './LocalDeviceRepository'
import type { DeviceBootstrapStatus, DeviceRecoveryStatus, DeviceRegistrationStatus, LocalDeviceKeyMaterial } from './types/localDeviceTypes'

export const useDeviceStore = defineStore('device', () => {
  const userStore = useUserStore()
  const dbStore = useDbStore()

  const localDevice: Ref<LocalDeviceKeyMaterial | null> = ref(null)
  const bootstrapStatus: Ref<DeviceBootstrapStatus> = ref('idle')
  const recoveryStatus: Ref<DeviceRecoveryStatus> = ref('none')
  const bootstrapError: Ref<string | null> = ref(null)

  let bootstrapPromise: Promise<void> | null = null
  let bootstrapGeneration = 0

  const deviceId = computed<string | null>(() => localDevice.value?.device.deviceId ?? null)
  const isRegistered = computed<boolean>(() => bootstrapStatus.value === 'ready' && !!deviceId.value)
  const isLoading = computed<boolean>(() =>
    ['waiting-for-database', 'loading-local-device', 'generating-keys', 'registering', 'persisting', 'upgrading-auth'].includes(bootstrapStatus.value)
  )
  const applicationReady = computed<boolean>(
    () => bootstrapStatus.value === 'ready' && dbStore.dbStatus === 'ready' && userStore.authStatus === 'upgraded' && !!localDevice.value
  )
  const registrationStatus = computed<DeviceRegistrationStatus>(() => {
    switch (bootstrapStatus.value) {
      case 'ready':
        return 'registered'
      case 'generating-keys':
        return 'generating'
      case 'registering':
      case 'persisting':
      case 'upgrading-auth':
        return 'registering'
      case 'recovery-required':
        return 'incomplete'
      case 'error':
        return 'error'
      default:
        return 'loading'
    }
  })

  watch(
    [() => userStore.authStatus, () => userStore.principal?.id, () => dbStore.dbStatus],
    ([authStatus, userId, dbStatus]) => {
      if (authStatus === 'none') {
        resetBootstrap()
        return
      }

      if (!userId) return
      if (dbStatus !== 'ready') {
        bootstrapStatus.value = 'waiting-for-database'
        return
      }

      void bootstrap().catch((error: unknown) => {
        bootstrapError.value = error instanceof Error ? error.message : String(error)
        bootstrapStatus.value = 'error'
        console.error('[device-store] Local-device bootstrap failed:', error)
      })
    },
    { immediate: true }
  )

  async function bootstrap(): Promise<void> {
    if (bootstrapPromise) return bootstrapPromise
    if (applicationReady.value) return

    const generation = bootstrapGeneration
    bootstrapPromise = runBootstrap(generation).finally(() => {
      bootstrapPromise = null
    })
    return bootstrapPromise
  }

  async function runBootstrap(generation: number): Promise<void> {
    const userId = userStore.principal?.id
    if (!userId || dbStore.dbStatus !== 'ready') return

    bootstrapError.value = null
    bootstrapStatus.value = 'loading-local-device'
    const repository = new LocalDeviceRepository(dbStore.db)
    const result = await repository.load(userId)
    if (generation !== bootstrapGeneration) return

    if (result.status === 'invalid') {
      requireRecovery(result.reason)
      return
    }

    if (result.status === 'not-found') {
      if (userStore.authStatus !== 'pre-upgrade') {
        requireRecovery('This authenticated device has no local cryptographic identity.')
        return
      }

      bootstrapStatus.value = 'generating-keys'
      const service = new DeviceRegistrationService({
        register: (request) => deviceApi.registerDevice(request, userStore.authUpgradeToken),
      })
      const registeredDevice = await service.register({ userId, deviceName: getDeviceLabel() })
      if (generation !== bootstrapGeneration) return

      bootstrapStatus.value = 'persisting'
      await repository.saveRegistration(registeredDevice)
      localDevice.value = registeredDevice
    } else {
      localDevice.value = result.keyMaterial
    }

    await finishAuthentication(generation)
  }

  async function finishAuthentication(generation: number): Promise<void> {
    const device = localDevice.value
    if (!device) throw new Error('Cannot finish authentication without a local device.')

    if (userStore.authStatus === 'pre-upgrade') {
      bootstrapStatus.value = 'upgrading-auth'
      try {
        await userStore.upgradeAuth(device.device.deviceId)
      } catch (error: unknown) {
        if (error instanceof StoredDeviceUnavailableError) {
          requireRecovery('The server no longer recognizes this local device.')
          return
        }
        throw error
      }
    }

    if (generation !== bootstrapGeneration) return
    if (userStore.authenticatedDeviceId !== device.device.deviceId) {
      requireRecovery('The authenticated session belongs to a different local device.')
      return
    }

    recoveryStatus.value = 'none'
    bootstrapStatus.value = 'ready'
  }

  function requireRecovery(reason: string): void {
    bootstrapError.value = reason
    bootstrapStatus.value = 'recovery-required'
    recoveryStatus.value = 'required'
  }

  function resetBootstrap(): void {
    bootstrapGeneration++
    localDevice.value = null
    bootstrapError.value = null
    bootstrapStatus.value = 'idle'
    recoveryStatus.value = 'none'
  }

  async function reregisterDevice(): Promise<void> {
    if (recoveryStatus.value === 'processing') return
    if (userStore.authStatus !== 'pre-upgrade') {
      recoveryStatus.value = 'error'
      bootstrapError.value = 'Log in again before registering a replacement device.'
      return
    }

    recoveryStatus.value = 'processing'
    try {
      await dbStore.archiveCurrentDatabase()
      resetBootstrap()
      recoveryStatus.value = 'processing'
    } catch (error: unknown) {
      console.error('[device-store] Failed to prepare replacement device:', error)
      bootstrapStatus.value = 'error'
      recoveryStatus.value = 'error'
    }
  }

  function clearRecovery(): void {
    recoveryStatus.value = 'none'
  }

  return {
    applicationReady,
    bootstrapError,
    bootstrapStatus,
    deviceId,
    isLoading,
    isRegistered,
    localDevice: computed(() => localDevice.value),
    recoveryStatus,
    registrationStatus,
    bootstrap,
    clearRecovery,
    reregisterDevice,
  }
})
