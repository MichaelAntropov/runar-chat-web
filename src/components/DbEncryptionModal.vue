<script setup lang="ts">
import { Modal } from 'bootstrap'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useDbStore } from '@/db/dbStore'

import PinInput from './PinInput.vue'

const PIN_LENGTH = 8

const { t } = useI18n()
const dbStore = useDbStore()

const dbEncryptionModalRef = ref<HTMLElement | null>(null)
const bsModal = ref<Modal | null>(null)

const step = ref<'SETUP_PROMPT' | 'SETUP_CREATE' | 'SETUP_VERIFY' | 'UNLOCK'>('UNLOCK')

const focusReady = ref(false)
const pin = ref<string>('')
const confirmPin = ref<string>('')
const errorMessageKey = ref<string>('')

onMounted(() => {
  if (dbEncryptionModalRef.value) {
    if (dbStore.dbStatus === 'setup-required') {
      step.value = 'SETUP_PROMPT'
    }

    if (dbStore.dbStatus === 'unlock-required') {
      step.value = 'UNLOCK'
    }

    bsModal.value = new Modal(dbEncryptionModalRef.value, { backdrop: 'static', keyboard: false })
    dbEncryptionModalRef.value.addEventListener('shown.bs.modal', () => {
      focusReady.value = true
    })
    bsModal.value.show()
  }
})

const clearAndMoveToStep = (newStep: typeof step.value) => {
  step.value = newStep
  pin.value = ''
  confirmPin.value = ''
  errorMessageKey.value = ''
}

const handleUnlock = () => {
  console.log('Attempting to decrypt with:', pin.value)
  bsModal.value?.hide()
  dbStore.unlockDb(pin.value)
}

const handleSetupPinCreated = () => {
  if (pin.value.length !== PIN_LENGTH) {
    errorMessageKey.value = 'db-encryption.error-pin-incomplete'
  } else {
    step.value = 'SETUP_VERIFY'
    errorMessageKey.value = ''
  }
}

const handleSetupVerifyAndComplete = () => {
  if (pin.value === confirmPin.value) {
    bsModal.value?.hide()
    console.log('Setting up encryption with PIN:', pin.value)
    dbStore.setupEncryption(pin.value)
  } else {
    errorMessageKey.value = 'db-encryption.error-pin-mismatch'
    confirmPin.value = ''
  }
}

const handleEncryptionDeclined = () => {
  bsModal.value?.hide()
  dbStore.setupEncryption(null)
}
</script>

<template>
  <div class="modal fade" ref="dbEncryptionModalRef" id="dbEncryptionModal">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <!-- HEADER -->
        <div class="modal-header">
          <h5 class="modal-title">
            <span v-if="step === 'UNLOCK'">{{ t('db-encryption.unlock-title') }}</span>
            <span v-else-if="step === 'SETUP_PROMPT'">
              {{ t('db-encryption.setup-prompt-title') }}
            </span>
            <span v-else>{{ t('db-encryption.setup-title') }}</span>
          </h5>
        </div>

        <div class="modal-body text-center p-4">
          <!-- ERROR ALERT -->
          <div v-if="errorMessageKey" class="alert alert-danger p-2 small">
            {{ t(errorMessageKey) }}
          </div>

          <!-- UNLOCK MODE -->
          <div v-if="step === 'UNLOCK'">
            <p>{{ t('db-encryption.unlock-description') }}</p>
            <PinInput
              :length="PIN_LENGTH"
              v-model="pin"
              v-model:focus-ready="focusReady"
              @complete="handleUnlock"
            />
            <div class="d-flex mt-3">
              <button class="btn btn-primary w-100" @click="handleUnlock">
                {{ t('db-encryption.continue') }}
              </button>
            </div>
          </div>

          <!-- SETUP FLOW -->
          <div v-else-if="step === 'SETUP_PROMPT'">
            <p>{{ t('db-encryption.setup-prompt-description') }}</p>
            <div class="d-flex gap-2">
              <button class="btn btn-secondary w-100" @click="handleEncryptionDeclined">
                {{ t('db-encryption.no') }}
              </button>
              <button class="btn btn-primary w-100" @click="clearAndMoveToStep('SETUP_CREATE')">
                {{ t('db-encryption.encrypt') }}
              </button>
            </div>
          </div>

          <div v-else-if="step === 'SETUP_CREATE'">
            <p>{{ t('db-encryption.setup-create-description', { length: PIN_LENGTH }) }}</p>
            <PinInput :length="PIN_LENGTH" v-model="pin" />
            <div class="d-flex gap-2 mt-3">
              <button class="btn btn-secondary w-100" @click="clearAndMoveToStep('SETUP_PROMPT')">
                {{ t('db-encryption.go-back') }}
              </button>
              <button class="btn btn-primary w-100" @click="handleSetupPinCreated">
                {{ t('db-encryption.continue') }}
              </button>
            </div>
          </div>

          <div v-else-if="step === 'SETUP_VERIFY'">
            <p>{{ t('db-encryption.setup-verify-description') }}</p>
            <PinInput :length="PIN_LENGTH" v-model="confirmPin" />
            <div class="d-flex gap-2 mt-3">
              <button class="btn btn-secondary w-100" @click="clearAndMoveToStep('SETUP_CREATE')">
                {{ t('db-encryption.go-back') }}
              </button>
              <button class="btn btn-primary w-100" @click="handleSetupVerifyAndComplete">
                {{ t('db-encryption.complete') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style></style>
