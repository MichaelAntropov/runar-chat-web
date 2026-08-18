<script setup lang="ts">
import { Modal } from 'bootstrap'
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  isProcessing: boolean
  hasError: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  logout: []
  reregister: []
}>()

const { t } = useI18n()
const modalElementRef = useTemplateRef<HTMLElement>('modal-element')
let modalInstance: Modal | null = null

onMounted(() => {
  if (!modalElementRef.value) return

  modalInstance = new Modal(modalElementRef.value, {
    backdrop: 'static',
    keyboard: false,
  })
  modalInstance.show()
})

onBeforeUnmount(() => {
  modalInstance?.hide()
  modalInstance?.dispose()
})
</script>

<template>
  <Teleport to="body">
    <div ref="modal-element" class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title fs-5">{{ t('device-recovery.title') }}</h2>
          </div>
          <div class="modal-body">
            <p class="mb-0">{{ t('device-recovery.description') }}</p>
            <div v-if="hasError" class="alert alert-danger mt-3 mb-0" role="alert">
              {{ t('device-recovery.error') }}
            </div>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="isProcessing"
              @click="emit('logout')"
            >
              {{ t('device-recovery.logout') }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="isProcessing"
              @click="emit('reregister')"
            >
              <span v-if="isProcessing" class="spinner-border spinner-border-sm me-2"></span>
              {{ t('device-recovery.reregister') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
