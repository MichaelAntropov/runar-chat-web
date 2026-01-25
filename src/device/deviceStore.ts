import { defineStore } from 'pinia'
import { computed, ref, toRaw, watch, type Ref } from 'vue'
import { useUserStore } from '../user/userStore'
import type { CryptoKeyPairRawPublic } from '@/device/types/CryptoKeyPairRawPublic'
import type { KeyPairState } from './types/KeyPairState'
import type { OneTimePreKeyState } from './types/OneTimePreKeyState'
import type { SignedPreKeyState } from './types/SignedPreKeyState'
import type { RegisterDeviceRequest } from '@/device/types/RegisterDeviceRequest'
import { Base64 } from 'js-base64'
import type { RegisterDeviceResponse } from '@/device/types/RegisterDeviceResponses'
import type { KeyBundle } from './types/KeyBundle'
import { KEYS_STORE, PRE_KEYS_STORE, IDENTITY_KEY_BUNDLE_KEY } from '../db/VeilDB'
import { useDbStore } from '@/db/dbStore'

export type DeviceRegistrationStatus =
  | 'loading'
  | 'incomplete'
  | 'generating'
  | 'signing'
  | 'registering'
  | 'registered'
  | 'persisted'
  | 'error'

const OTPK_COUNT = 5

export const useDeviceStore = defineStore('device', () => {
  const userStore = useUserStore()
  const dbStore = useDbStore()

  const deviceId: Ref<string | null> = ref(null)
  const registrationStatus: Ref<DeviceRegistrationStatus> = ref('loading')

  const identityX25519 = ref<KeyPairState>({ id: null, keyPair: null, publicKey: null })
  const identityEd25519 = ref<KeyPairState>({ id: null, keyPair: null, publicKey: null })
  const signedPreKey = ref<SignedPreKeyState>({
    id: null,
    keyPair: null,
    publicKey: null,
    signature: null,
  })
  const oneTimePreKeys = ref<OneTimePreKeyState[]>([])

  const isRegistered = computed<boolean>(
    () => registrationStatus.value === 'registered' && !!deviceId.value,
  )
  const isLoading = computed<boolean>(() =>
    ['loading', 'generating', 'signing', 'registering'].includes(registrationStatus.value),
  )

  watch(
    registrationStatus,
    (newStatus, oldStatus) => {
      if (oldStatus === 'loading' && newStatus === 'incomplete' && !isRegistered.value) {
        console.log('Device status not registered - attempting registration.')
        try {
          registerDevice()
        } catch (error: unknown) {
          console.log(`Failed to register device: ${error}`)
          console.error(error)
          registrationStatus.value = 'error'
        }
      }
    },
    { immediate: true },
  )

  watch(
    () => dbStore.dbStatus,
    (newStatus) => {
      if (newStatus === 'ready') {
        try {
          loadStateFromDB()
        } catch (error: unknown) {
          console.log(`Failed to load state from IndexedDB: ${error}`)
          console.error(error)
          registrationStatus.value = 'error'
        }
      }
    },
  )

  async function loadStateFromDB(): Promise<void> {
    console.log('Load device state from IndexedDB...')
    registrationStatus.value = 'loading'

    const keysPromise = dbStore.db[KEYS_STORE].get(IDENTITY_KEY_BUNDLE_KEY)
    const preKeysPromise = dbStore.db[PRE_KEYS_STORE].toArray()

    const [keyBundle, preKeys] = await Promise.all([keysPromise, preKeysPromise])

    if (keyBundle && preKeys && preKeys.length > 0) {
      console.log('Found existing keys in IndexedDB. Restoring state.')

      deviceId.value = keyBundle.deviceId
      identityX25519.value = keyBundle.identityX25519
      identityEd25519.value = keyBundle.identityEd25519
      signedPreKey.value = keyBundle.signedPreKey
      oneTimePreKeys.value = preKeys

      registrationStatus.value = 'registered'
      console.log('Device state restored successfully.')
    } else {
      console.log('No existing keys found in IndexedDB or data incomplete.')
      registrationStatus.value = 'incomplete'
    }
  }

  async function generateKeysIfNeeded(): Promise<boolean> {
    if (
      identityX25519.value.keyPair &&
      identityEd25519.value.keyPair &&
      signedPreKey.value.keyPair &&
      oneTimePreKeys.value.length > 0
    ) {
      console.log('Keys already generated.')
      return true
    }

    console.log('Generating keys using Web Crypto...')
    registrationStatus.value = 'generating'

    try {
      const [idX_kp, idEd_kp, spk_kp, otpk_kps] = await Promise.all([
        generateX25519KeyPairWebCrypto(),
        generateEd25519KeyPairWebCrypto(),
        generateX25519KeyPairWebCrypto(),
        generateMultipleX25519KeysWebCrypto(OTPK_COUNT),
      ])

      identityX25519.value = { id: null, ...idX_kp }
      identityEd25519.value = { id: null, ...idEd_kp }
      signedPreKey.value = { id: null, signature: null, ...spk_kp }

      for (const otpk_kp of otpk_kps) {
        oneTimePreKeys.value.push({ id: null, createdAt: null, ...otpk_kp })
      }

      console.log('Web Crypto keys generated successfully.')
      return true
    } catch (error: unknown) {
      identityX25519.value = { id: null, keyPair: null, publicKey: null }
      identityEd25519.value = { id: null, keyPair: null, publicKey: null }
      signedPreKey.value = { id: null, keyPair: null, publicKey: null, signature: null }
      oneTimePreKeys.value = []
      throw error
    }
  }

  async function signPreKeyIfNeeded(): Promise<boolean> {
    const idEdKey = identityEd25519.value.keyPair?.privateKey
    const spkPublicKey = signedPreKey.value.publicKey

    if (!idEdKey || !spkPublicKey) {
      throw new Error(
        `Cannot sign preKey: Missing Ed25519 private key or Signed PreKey public key. ${{ hasIdEdKey: !!idEdKey, hasSpkPub: !!spkPublicKey }}`,
      )
    }

    if (signedPreKey.value.signature) {
      console.log('PreKey already signed.')
      return true
    }

    console.log('Signing preKey using Web Crypto...')
    registrationStatus.value = 'signing'

    const signature = await signWebCrypto(spkPublicKey, idEdKey)
    signedPreKey.value.signature = signature
    console.log('PreKey signed successfully using Web Crypto.')
    return true
  }

  async function registerDevice() {
    if (isRegistered.value) {
      console.log('Device is already registered.')
      return
    }

    if (isLoading.value) {
      console.warn(`Registration already in progress with status: ${registrationStatus.value}`)
      return
    }

    // Handle case where pre keys run out
    const keysGenerated = await generateKeysIfNeeded()
    if (!keysGenerated) return

    const preKeySigned = await signPreKeyIfNeeded()
    if (!preKeySigned) return

    console.log('Preparing registration payload...')
    registrationStatus.value = 'registering'

    const idXPub = identityX25519.value.publicKey
    const idEdPub = identityEd25519.value.publicKey
    const spkPub = signedPreKey.value.publicKey
    const spkSig = signedPreKey.value.signature
    const otpkPubs = oneTimePreKeys.value.map((k) => k.publicKey)

    if (
      !idXPub ||
      !idEdPub ||
      !spkPub ||
      !spkSig ||
      otpkPubs.some((k) => !k) ||
      otpkPubs.length !== OTPK_COUNT
    ) {
      throw new Error(
        'Cannot register: Missing required public key components or signature after generation/signing.',
      )
    }

    const payload: RegisterDeviceRequest = {
      identityX25519PublicKey: Base64.fromUint8Array(idXPub),
      identityEd25519PublicKey: Base64.fromUint8Array(idEdPub),
      signedPublicPreKey: Base64.fromUint8Array(spkPub),
      preKeySignature: Base64.fromUint8Array(spkSig),
      oneTimePublicPreKeys: oneTimePreKeys.value.map((key) =>
        Base64.fromUint8Array(key.publicKey!),
      ),
    }

    console.log('Sending registration request...')
    // console.log(JSON.stringify(payload))
    const response = await fetch('/api/v1/device/register-device', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (await userStore.getAccessToken()),
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorBody = await response.text() // Try to get more error details
      console.error('Registration API error body:', errorBody)
      throw new Error(`Registration HTTP error! Status: ${response.status}`)
    }

    const parsed: RegisterDeviceResponse = await response.json()
    console.log('Registration successful:', parsed)

    deviceId.value = parsed.deviceId
    identityX25519.value.id = parsed.deviceId
    identityEd25519.value.id = parsed.deviceId
    signedPreKey.value.id = parsed.deviceId

    if (parsed.oneTimePreKeys && parsed.oneTimePreKeys.length === oneTimePreKeys.value.length) {
      parsed.oneTimePreKeys.forEach((dto, index) => {
        oneTimePreKeys.value[index].id = dto.id
        oneTimePreKeys.value[index].createdAt = dto.createdAt
      })
    } else {
      console.warn(
        'Mismatch between sent OTPK count and received DTO count, or missing data in response.',
      )
    }

    const keyBundle: KeyBundle = {
      deviceId: toRaw(deviceId.value!), // Should have value here
      identityX25519: toRaw(identityX25519.value),
      identityEd25519: toRaw(identityEd25519.value),
      signedPreKey: toRaw(signedPreKey.value),
    }
    const otpksToStore = toRaw(oneTimePreKeys.value)

    const rawDb = toRaw(dbStore.db)
    await rawDb.transaction('rw', rawDb[KEYS_STORE], rawDb[PRE_KEYS_STORE], async () => {
      await rawDb[KEYS_STORE].add(keyBundle, IDENTITY_KEY_BUNDLE_KEY)
      await rawDb[PRE_KEYS_STORE].bulkAdd(otpksToStore)
    })

    registrationStatus.value = 'registered'
    console.log('Keys persisted to IndexedDB after registration.')
  }

  return {
    // State (read-only refs)
    deviceId,
    registrationStatus,
    identityX25519: computed(() => identityX25519.value),
    preKey: computed(() => signedPreKey.value),

    // Getters
    isRegistered,
    isLoading,

    // Actions
    registerDevice,
  }
})

/**
 * Generates an X25519 key pair using Web Crypto.
 * @returns A Promise resolving to the private CryptoKey and raw public key bytes.
 */
export async function generateX25519KeyPairWebCrypto(): Promise<CryptoKeyPairRawPublic> {
  try {
    const keyPair: CryptoKeyPair = (await crypto.subtle.generateKey(
      { name: 'X25519' },
      false, // Allows exporting public key, but not private
      ['deriveBits', 'deriveKey'],
    )) as CryptoKeyPair

    const publicKeyBytes = await crypto.subtle.exportKey('raw', keyPair.publicKey)

    return {
      keyPair: keyPair,
      publicKey: new Uint8Array(publicKeyBytes),
    }
  } catch (error: unknown) {
    console.error('Error generating X25519 key pair:', error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate X25519 key: ${message}`)
  }
}

/**
 * Generates an Ed25519 key pair using Web Crypto.
 * @returns A Promise resolving to the private CryptoKey and raw public key bytes.
 */
export async function generateEd25519KeyPairWebCrypto(): Promise<CryptoKeyPairRawPublic> {
  try {
    const keyPair: CryptoKeyPair = (await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      false, // Do not allow export of private key
      ['sign', 'verify'],
    )) as CryptoKeyPair

    const publicKeyBytes = await crypto.subtle.exportKey('raw', keyPair.publicKey)

    return {
      keyPair: keyPair,
      publicKey: new Uint8Array(publicKeyBytes),
    }
  } catch (error: unknown) {
    console.error('Error generating Ed25519 key pair:', error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate Ed25519 key: ${message}`)
  }
}

/**
 * Signs a message using an Ed25519 private CryptoKey.
 * @param message The message to sign (Uint8Array).
 * @param privateKey The Ed25519 private CryptoKey object.
 * @returns A Promise resolving to the signature as a Uint8Array.
 */
export async function signWebCrypto(
  message: Uint8Array<ArrayBuffer>,
  privateKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!privateKey || privateKey.type !== 'private' || privateKey.algorithm.name !== 'Ed25519') {
    throw new Error('Invalid private key provided for signing (must be Ed25519 private CryptoKey).')
  }

  try {
    const signatureBuffer = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, message)
    return new Uint8Array(signatureBuffer)
  } catch (error: unknown) {
    console.error('Error signing message:', error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to sign message: ${message}`)
  }
}

/**
 * Helper to generate multiple X25519 key pairs using Web Crypto.
 * @param count Number of key pairs to generate.
 * @returns A Promise resolving to an array of key pairs.
 */
export async function generateMultipleX25519KeysWebCrypto(
  count: number,
): Promise<CryptoKeyPairRawPublic[]> {
  const keyPromises: Promise<CryptoKeyPairRawPublic>[] = []

  for (let i = 0; i < count; i++) {
    keyPromises.push(generateX25519KeyPairWebCrypto())
  }
  return Promise.all(keyPromises)
}
