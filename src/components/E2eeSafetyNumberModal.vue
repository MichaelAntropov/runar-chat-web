<script setup lang="ts">
import { Modal } from 'bootstrap'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { chatApi } from '@/chat/api/chatApi'
import { generateSafetyNumber } from '@/chat/crypto/safetyNumber'
import type { IdentityKey } from '@/chat/types/identity-key/IdentityKey'
import { useDeviceStore } from '@/device/deviceStore'
import { useUserStore } from '@/user/userStore'

interface Props {
  contactUserId: string
  contactUsername: string
}

interface SafetyNumberDevice {
  deviceId: string
  fingerprint: string
}

const props = defineProps<Props>()

const deviceStore = useDeviceStore()
const userStore = useUserStore()
const { t } = useI18n()

const modalElementRef = useTemplateRef<HTMLElement>('modal-element')
const modalInstance: Ref<Modal | null> = ref(null)
const isLoading = ref(false)
const safetyNumber: Ref<string | null> = ref(null)
const hasError = ref(false)
const contactName = ref('')
const localDevices: Ref<SafetyNumberDevice[]> = ref([])
const remoteDevices: Ref<SafetyNumberDevice[]> = ref([])
const isSafetyNumberCopied = ref(false)
const safetyNumberGroups = computed(() => safetyNumber.value?.match(/.{5}/g) ?? [])

let requestId = 0
let copyFeedbackTimeout: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  if (modalElementRef.value) modalInstance.value = new Modal(modalElementRef.value)
})

onBeforeUnmount(() => {
  requestId++
  if (copyFeedbackTimeout !== null) clearTimeout(copyFeedbackTimeout)
  modalInstance.value?.hide()
  modalInstance.value?.dispose()
})

async function open(): Promise<void> {
  const localUserId = userStore.principal?.id
  if (!localUserId || isLoading.value) return

  const currentRequestId = ++requestId
  const remoteUserId = props.contactUserId
  safetyNumber.value = null
  isSafetyNumberCopied.value = false
  contactName.value = props.contactUsername
  localDevices.value = []
  remoteDevices.value = []
  hasError.value = false
  isLoading.value = true
  modalInstance.value?.show()

  try {
    const [localIdentityKeys, remoteIdentityKeys] = await Promise.all([
      chatApi.getIdentityKeys(localUserId),
      chatApi.getIdentityKeys(remoteUserId),
    ])

    if (currentRequestId !== requestId) return
    if (!containsCurrentDeviceIdentity(localIdentityKeys)) {
      throw new Error('The server account identity keys do not include this device identity.')
    }

    const result = await generateSafetyNumber(
      { userId: localUserId, identityKeys: localIdentityKeys },
      { userId: remoteUserId, identityKeys: remoteIdentityKeys },
    )
    safetyNumber.value = result.safetyNumber
    localDevices.value = result.firstAccountDevices
    remoteDevices.value = result.secondAccountDevices
  } catch (error) {
    if (currentRequestId !== requestId) return
    console.error('[E2eeSafetyNumberModal] Failed to generate Safety Number:', error)
    hasError.value = true
  } finally {
    if (currentRequestId === requestId) isLoading.value = false
  }
}

function close(): void {
  requestId++
  isLoading.value = false
  modalInstance.value?.hide()
}

async function copySafetyNumber(event: MouseEvent): Promise<void> {
  if (!safetyNumber.value || !navigator.clipboard) return

  if (event.currentTarget instanceof HTMLElement) event.currentTarget.blur()

  try {
    await navigator.clipboard.writeText(safetyNumber.value)
    isSafetyNumberCopied.value = true

    if (copyFeedbackTimeout !== null) clearTimeout(copyFeedbackTimeout)
    copyFeedbackTimeout = setTimeout(() => {
      isSafetyNumberCopied.value = false
      copyFeedbackTimeout = null
    }, 2000)
  } catch (error) {
    console.error('[E2eeSafetyNumberModal] Failed to copy Safety Number:', error)
  }
}

function containsCurrentDeviceIdentity(identityKeys: readonly IdentityKey[]): boolean {
  const device = deviceStore.localDevice?.device
  if (!device) return false

  return identityKeys.some(
    (identityKey) =>
      identityKey.deviceId === device.deviceId &&
      bytesEqual(identityKey.x25519PublicKey, device.identityX25519PublicKeyBytes) &&
      bytesEqual(identityKey.ed25519PublicKey, device.identityEd25519PublicKeyBytes),
  )
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div
      ref="modal-element"
      class="modal fade"
      tabindex="-1"
      :aria-label="t('chat.safety-number.title')"
      aria-hidden="true"
    >
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title fs-5">{{ t('chat.safety-number.title') }}</h2>
            <button
              type="button"
              class="btn-close"
              :aria-label="t('chat.safety-number.close')"
              @click="close"
            ></button>
          </div>
          <div class="modal-body">
            <div v-if="isLoading" class="text-center py-4" role="status">
              <span class="spinner-border" aria-hidden="true"></span>
              <p class="text-body-secondary mt-3 mb-0">
                {{ t('chat.safety-number.loading') }}
              </p>
            </div>

            <div v-else-if="hasError" class="alert alert-danger mb-0" role="alert">
              <p class="mb-3">{{ t('chat.safety-number.error') }}</p>
              <button type="button" class="btn btn-outline-danger btn-sm" @click="open">
                {{ t('chat.safety-number.retry') }}
              </button>
            </div>

            <template v-else-if="safetyNumber">
              <p>
                {{ t('chat.safety-number.description', { username: contactName }) }}
              </p>
              <div class="d-flex flex-column gap-2 my-3">
                <div class="safety-number border rounded p-3" aria-live="polite">
                  <span v-for="(group, index) in safetyNumberGroups" :key="index">
                    {{ group }}
                  </span>
                </div>
                <button
                  type="button"
                  class="btn btn-outline-secondary w-100"
                  :aria-label="
                    t(
                      isSafetyNumberCopied
                        ? 'chat.safety-number.copied'
                        : 'chat.safety-number.copy',
                    )
                  "
                  :title="
                    t(
                      isSafetyNumberCopied
                        ? 'chat.safety-number.copied'
                        : 'chat.safety-number.copy',
                    )
                  "
                  @click="copySafetyNumber"
                >
                  <i
                    :class="isSafetyNumberCopied ? 'bi bi-check2' : 'bi bi-clipboard'"
                    aria-hidden="true"
                  ></i>
                  <span class="ms-1">
                    {{
                      t(
                        isSafetyNumberCopied
                          ? 'chat.safety-number.copied'
                          : 'chat.safety-number.copy',
                      )
                    }}
                  </span>
                </button>
              </div>
              <p class="small text-body-secondary">
                {{ t('chat.safety-number.key-change-warning') }}
              </p>

              <div class="alert alert-warning small" role="alert">
                {{ t('chat.safety-number.review-devices') }}
              </div>

              <div class="row g-3">
                <section class="col-12 col-md-6">
                  <h3 class="fs-6 d-flex align-items-center justify-content-between">
                    {{ t('chat.safety-number.your-devices') }}
                    <span class="badge text-bg-secondary">{{ localDevices.length }}</span>
                  </h3>
                  <ul class="list-group">
                    <li
                      v-for="(device, index) in localDevices"
                      :key="device.deviceId"
                      class="list-group-item"
                    >
                      <div class="d-flex justify-content-between align-items-center gap-2 mb-1">
                        <span class="fw-medium">
                          {{ t('chat.safety-number.device', { number: index + 1 }) }}
                        </span>
                        <span
                          v-if="device.deviceId === deviceStore.deviceId"
                          class="badge text-bg-primary"
                        >
                          {{ t('chat.safety-number.this-device') }}
                        </span>
                      </div>
                      <code class="d-block text-break small">{{ device.deviceId }}</code>
                      <small class="d-block text-body-secondary mt-2">
                        {{ t('chat.safety-number.key-fingerprint') }}
                      </small>
                      <code class="d-block device-fingerprint">{{ device.fingerprint }}</code>
                    </li>
                  </ul>
                </section>

                <section class="col-12 col-md-6">
                  <h3 class="fs-6 d-flex align-items-center justify-content-between">
                    {{ t('chat.safety-number.contact-devices', { username: contactName }) }}
                    <span class="badge text-bg-secondary">{{ remoteDevices.length }}</span>
                  </h3>
                  <ul class="list-group">
                    <li
                      v-for="(device, index) in remoteDevices"
                      :key="device.deviceId"
                      class="list-group-item"
                    >
                      <span class="fw-medium">
                        {{ t('chat.safety-number.device', { number: index + 1 }) }}
                      </span>
                      <code class="d-block text-break small mt-1">{{ device.deviceId }}</code>
                      <small class="d-block text-body-secondary mt-2">
                        {{ t('chat.safety-number.key-fingerprint') }}
                      </small>
                      <code class="d-block device-fingerprint">{{ device.fingerprint }}</code>
                    </li>
                  </ul>
                </section>
              </div>
            </template>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="close">
              {{ t('chat.safety-number.close') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.safety-number {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem 1rem;
  font-family: var(--bs-font-monospace);
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  text-align: center;
  user-select: all;
}

.device-fingerprint {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
  user-select: all;
}
</style>
