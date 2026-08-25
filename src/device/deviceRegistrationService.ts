import { Base64 } from 'js-base64'

import { generateInitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dh'
import type { InitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dhTypes'

import type { LocalDeviceKeyMaterial } from './types/LocalDeviceKeyMaterial'
import type { RegisterDeviceRequest } from './types/RegisterDeviceRequest'
import type { RegisterDeviceResponse } from './types/RegisterDeviceResponses'

export const INITIAL_ONE_TIME_PRE_KEY_COUNT = 5

export interface DeviceRegistrationDependencies {
  generateKeyMaterial?: typeof generateInitialDeviceKeyMaterial
  register: (request: RegisterDeviceRequest) => Promise<RegisterDeviceResponse>
}

export interface RegisterLocalDeviceOptions {
  userId: string
  deviceName: string
}

export class DeviceRegistrationService {
  private readonly generateKeyMaterial: typeof generateInitialDeviceKeyMaterial

  constructor(private readonly dependencies: DeviceRegistrationDependencies) {
    this.generateKeyMaterial = dependencies.generateKeyMaterial ?? generateInitialDeviceKeyMaterial
  }

  async register(options: RegisterLocalDeviceOptions): Promise<LocalDeviceKeyMaterial> {
    const material = await this.generateKeyMaterial({
      userId: options.userId,
      oneTimePreKeyCount: INITIAL_ONE_TIME_PRE_KEY_COUNT,
    })
    const exported = await exportPublicKeyMaterial(material)
    const response = await this.dependencies.register({
      identityX25519PublicKey: Base64.fromUint8Array(exported.identityX25519),
      identityEd25519PublicKey: Base64.fromUint8Array(exported.identityEd25519),
      signedPublicPreKey: Base64.fromUint8Array(exported.signedPreKey),
      preKeySignature: Base64.fromUint8Array(material.signedPreKey.signature),
      oneTimePublicPreKeys: exported.oneTimePreKeys.map((key) => Base64.fromUint8Array(key)),
      deviceName: options.deviceName,
    })

    validateRegistrationResponse(response, material.oneTimePreKeys.length)

    return {
      device: {
        deviceId: response.deviceId,
        userId: options.userId,
        activeSignedPreKeyId: response.signedPreKeyId,
        identityX25519: material.identityX25519,
        identityX25519PublicKeyBytes: exported.identityX25519,
        identityEd25519: material.identityEd25519,
        identityEd25519PublicKeyBytes: exported.identityEd25519,
      },
      signedPreKey: {
        id: response.signedPreKeyId,
        keyPair: material.signedPreKey.keyPair,
        publicKeyBytes: exported.signedPreKey,
        signature: material.signedPreKey.signature,
        createdAt: parseServerDate(response.signedPreKeyCreatedAt, 'signed pre-key'),
        retiredAt: null,
      },
      oneTimePreKeys: material.oneTimePreKeys.map((keyPair, index) => ({
        id: response.oneTimePreKeys[index].id,
        keyPair,
        publicKeyBytes: exported.oneTimePreKeys[index],
        createdAt: parseServerDate(response.oneTimePreKeys[index].createdAt, 'one-time pre-key'),
      })),
    }
  }
}

async function exportPublicKeyMaterial(material: InitialDeviceKeyMaterial): Promise<{
  identityX25519: Uint8Array<ArrayBuffer>
  identityEd25519: Uint8Array<ArrayBuffer>
  signedPreKey: Uint8Array<ArrayBuffer>
  oneTimePreKeys: Uint8Array<ArrayBuffer>[]
}> {
  const [identityX25519, identityEd25519, signedPreKey, oneTimePreKeys] = await Promise.all([
    exportRawPublicKey(material.identityX25519.publicKey),
    exportRawPublicKey(material.identityEd25519.publicKey),
    exportRawPublicKey(material.signedPreKey.keyPair.publicKey),
    Promise.all(material.oneTimePreKeys.map((key) => exportRawPublicKey(key.publicKey))),
  ])

  return { identityX25519, identityEd25519, signedPreKey, oneTimePreKeys }
}

async function exportRawPublicKey(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key))
}

function validateRegistrationResponse(
  response: RegisterDeviceResponse,
  expectedOtpks: number
): void {
  if (!response.deviceId || !response.signedPreKeyId || !response.signedPreKeyCreatedAt) {
    throw new Error('Device registration response is missing required identifiers or timestamps.')
  }
  if (response.oneTimePreKeys.length !== expectedOtpks) {
    throw new Error('Device registration response contains an unexpected one-time pre-key count.')
  }
  if (new Set(response.oneTimePreKeys.map((key) => key.id)).size !== expectedOtpks) {
    throw new Error('Device registration response contains duplicate one-time pre-key identifiers.')
  }
}

function parseServerDate(value: string, label: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${label} creation timestamp.`)
  return parsed
}
