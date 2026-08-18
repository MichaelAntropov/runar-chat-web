<script setup lang="ts">
import { isAxiosError } from 'axios'
import { Modal } from 'bootstrap'
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DeviceSession } from '@/auth/types/DeviceSessions'
import { deviceApi } from '@/device/deviceApi'

interface Props {
  device: DeviceSession | null
  open: boolean
  isRemovalEligible: () => boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  removed: [deviceId: string]
  unavailable: []
  unauthorized: []
}>()

const { t } = useI18n()

const modalElementRef = useTemplateRef<HTMLElement>('modal-element')
const modalInstance = ref<Modal | null>(null)
const isRemoving = ref(false)
const removeErrorKey = ref<string | null>(null)

onMounted(() => {
  if (modalElementRef.value) {
    modalInstance.value = new Modal(modalElementRef.value, {
      backdrop: 'static',
      keyboard: false,
    })
  }

  if (props.open) openModal()
})

onBeforeUnmount(() => {
  modalInstance.value?.hide()
  modalInstance.value?.dispose()
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      openModal()
    } else {
      modalInstance.value?.hide()
    }
  },
)

function openModal() {
  removeErrorKey.value = null
  modalInstance.value?.show()
}

function closeModal() {
  if (isRemoving.value) return

  emit('update:open', false)
}

async function removeSelectedDevice(): Promise<void> {
  const device = props.device
  if (!device || isRemoving.value) return

  removeErrorKey.value = null

  if (!props.isRemovalEligible()) {
    removeErrorKey.value = 'settings.devices.remove-too-soon'
    return
  }

  isRemoving.value = true

  try {
    await deviceApi.removeDevice(device.deviceId)
    emit('removed', device.deviceId)
    emit('update:open', false)
  } catch (error: unknown) {
    const status = isAxiosError(error) ? error.response?.status : undefined

    if (status === 404) {
      removeErrorKey.value = 'settings.devices.remove-unavailable'
      emit('unavailable')
    } else if (status === 400 || status === 403) {
      removeErrorKey.value = 'settings.devices.remove-not-allowed'
    } else if (status === 401) {
      emit('unauthorized')
    } else {
      removeErrorKey.value = 'settings.devices.remove-error'
    }

    console.error('[RemoveDeviceModal] Failed to remove device:', error)
  } finally {
    isRemoving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div ref="modal-element" class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title fs-5">{{ t('settings.devices.remove-title') }}</h2>
          </div>
          <div class="modal-body">
            <p class="mb-0">
              {{
                t('settings.devices.remove-confirm', {
                  device: props.device?.deviceName || t('settings.devices.no-name'),
                })
              }}
            </p>
            <div v-if="removeErrorKey" class="alert alert-danger mt-3 mb-0" role="alert">
              {{ t(removeErrorKey) }}
            </div>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="isRemoving"
              @click="closeModal"
            >
              {{ t('settings.devices.cancel') }}
            </button>
            <button
              type="button"
              class="btn btn-danger"
              :disabled="isRemoving"
              @click="removeSelectedDevice"
            >
              <span v-if="isRemoving" class="spinner-border spinner-border-sm me-2"></span>
              {{ t('settings.devices.remove') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
