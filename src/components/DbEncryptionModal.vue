<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Modal } from 'bootstrap'
import PinInput from './PinInput.vue'
import { useDbStore } from '@/db/dbStore'

const PIN_LENGTH = 8

const dbStore = useDbStore()

const dbEncryptionModalRef = ref<HTMLElement | null>(null)
const bsModal = ref<Modal | null>(null)

const step = ref<'SETUP_PROMPT' | 'SETUP_CREATE' | 'SETUP_VERIFY' | 'UNLOCK'>('UNLOCK')

const focusReady = ref(false)
const pin = ref<string>('')
const confirmPin = ref<string>('')
const errorMessage = ref<string>('')

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
  errorMessage.value = ''
}

const handleUnlock = () => {
  console.log('Attempting to decrypt with:', pin.value)
  bsModal.value?.hide()
  dbStore.unlockDb(pin.value)
}

const handleSetupPinCreated = () => {
  if (pin.value.length !== PIN_LENGTH) {
    errorMessage.value = 'PINs has to be filled in!'
  } else {
    step.value = 'SETUP_VERIFY'
    errorMessage.value = ''
  }
}

const handleSetupVerifyAndComplete = () => {
  if (pin.value === confirmPin.value) {
    bsModal.value?.hide()
    console.log('Setting up encryption with PIN:', pin.value)
    dbStore.setupEncryption(pin.value)
  } else {
    errorMessage.value = 'PINs do not match!'
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
            <span v-if="step === 'UNLOCK'">Unlock Messages</span>
            <span v-else-if="step === 'SETUP_PROMPT'">Enable Encryption</span>
            <span v-else>Set Your PIN</span>
          </h5>
        </div>

        <div class="modal-body text-center p-4">
          <!-- ERROR ALERT -->
          <div v-if="errorMessage" class="alert alert-danger p-2 small">{{ errorMessage }}</div>

          <!-- UNLOCK MODE -->
          <div v-if="step === 'UNLOCK'">
            <p>Enter your PIN to decrypt your messages.</p>
            <PinInput
              :length="PIN_LENGTH"
              v-model="pin"
              v-model:focus-ready="focusReady"
              @complete="handleUnlock"
            />
            <div class="d-flex mt-3">
              <button class="btn btn-primary w-100" @click="handleUnlock">Continue</button>
            </div>
          </div>

          <!-- SETUP FLOW -->
          <div v-else-if="step === 'SETUP_PROMPT'">
            <p>
              Would you like to encrypt your local message database? You will need to create a PIN.
            </p>
            <div class="d-flex gap-2">
              <button class="btn btn-secondary w-100" @click="handleEncryptionDeclined">No</button>
              <button class="btn btn-primary w-100" @click="clearAndMoveToStep('SETUP_CREATE')">
                Encrypt
              </button>
            </div>
          </div>

          <div v-else-if="step === 'SETUP_CREATE'">
            <p>Create a {{ PIN_LENGTH }}-digit alphanumeric PIN.</p>
            <PinInput :length="PIN_LENGTH" v-model="pin" />
            <div class="d-flex gap-2 mt-3">
              <button class="btn btn-secondary w-100" @click="clearAndMoveToStep('SETUP_PROMPT')">
                Go back
              </button>
              <button class="btn btn-primary w-100" @click="handleSetupPinCreated">Continue</button>
            </div>
          </div>

          <div v-else-if="step === 'SETUP_VERIFY'">
            <p>Confirm your PIN.</p>
            <PinInput :length="PIN_LENGTH" v-model="confirmPin" />
            <div class="d-flex gap-2 mt-3">
              <button class="btn btn-secondary w-100" @click="clearAndMoveToStep('SETUP_CREATE')">
                Go back
              </button>
              <button class="btn btn-primary w-100" @click="handleSetupVerifyAndComplete">
                Complete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style></style>
