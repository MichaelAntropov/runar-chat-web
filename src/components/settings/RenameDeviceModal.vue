<script setup lang="ts">
import { Modal } from 'bootstrap'
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DeviceSession } from '@/auth/types/DeviceSessions'
import { deviceApi } from '@/device/deviceApi'

interface Props {
  device: DeviceSession | null
  open: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  renamed: [deviceId: string, deviceName: string]
}>()

const { t } = useI18n()

const modalElementRef = useTemplateRef<HTMLElement>('modal-element')
const modalInstance = ref<Modal | null>(null)
const deviceName = ref('')
const renameErrorKey = ref<string | null>(null)
const isRenaming = ref(false)

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
  deviceName.value = props.device?.deviceName ?? ''
  renameErrorKey.value = null
  modalInstance.value?.show()
}

function closeModal() {
  if (isRenaming.value) return

  emit('update:open', false)
}

async function saveDeviceName() {
  const device = props.device
  const trimmedDeviceName = deviceName.value.trim()

  if (!device || isRenaming.value) return

  if (!trimmedDeviceName) {
    renameErrorKey.value = 'settings.devices.name-required'
    return
  }

  if (trimmedDeviceName.length > 30) {
    renameErrorKey.value = 'settings.devices.name-too-long'
    return
  }

  isRenaming.value = true
  renameErrorKey.value = null

  try {
    await deviceApi.renameDevice(device.deviceId, { deviceName: trimmedDeviceName })
    emit('renamed', device.deviceId, trimmedDeviceName)
    emit('update:open', false)
  } catch (error) {
    console.error('[RenameDeviceModal] Failed to rename device:', error)
    renameErrorKey.value = 'settings.devices.update-error'
  } finally {
    isRenaming.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div ref="modal-element" class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="rename-device-title" class="modal-title fs-5">
              {{ t('settings.devices.rename-title') }}
            </h2>
          </div>
          <form @submit.prevent="saveDeviceName">
            <div class="modal-body">
              <label class="form-label" for="device-name">
                {{ t('settings.devices.name-label') }}
              </label>
              <input
                id="device-name"
                v-model="deviceName"
                type="text"
                class="form-control"
                :class="{
                  'is-invalid':
                    renameErrorKey === 'settings.devices.name-required' ||
                    renameErrorKey === 'settings.devices.name-too-long',
                }"
                :placeholder="t('settings.devices.name-placeholder')"
                maxlength="30"
                autocomplete="off"
                :disabled="isRenaming"
              />
              <div class="form-text">{{ t('settings.devices.name-hint') }}</div>
              <div v-if="renameErrorKey" class="alert alert-danger mt-3 mb-0" role="alert">
                {{ t(renameErrorKey) }}
              </div>
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="isRenaming"
                @click="closeModal"
              >
                {{ t('settings.devices.cancel') }}
              </button>
              <button type="submit" class="btn btn-primary" :disabled="isRenaming">
                <span v-if="isRenaming" class="spinner-border spinner-border-sm me-2"></span>
                {{ t('settings.devices.save') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Teleport>
</template>
