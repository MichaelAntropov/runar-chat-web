import { Base64 } from 'js-base64'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { generateInitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dh'
import type { InitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dhTypes'

import {
  DeviceRegistrationService,
  INITIAL_ONE_TIME_PRE_KEY_COUNT,
} from '../deviceRegistrationService'
import type { RegisterDeviceResponse } from '../types/RegisterDeviceResponses'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const DEVICE_ID = '9a99d68f-6f78-47d6-827c-94e39770468d'
const SIGNED_PRE_KEY_ID = 'cb7812bb-c17f-40bf-b08b-e25e9f8617a6'
const CREATED_AT = '2026-08-25T10:00:00.000Z'

describe('DeviceRegistrationService', () => {
  let material: InitialDeviceKeyMaterial

  beforeAll(async () => {
    material = await generateInitialDeviceKeyMaterial({
      userId: USER_ID,
      oneTimePreKeyCount: INITIAL_ONE_TIME_PRE_KEY_COUNT,
    })
  })

  it('builds the registration request and keeps the signed pre-key ID independent', async () => {
    const register = vi.fn().mockResolvedValue(createResponse())
    const service = new DeviceRegistrationService({
      generateKeyMaterial: vi.fn().mockResolvedValue(material),
      register,
    })

    const device = await service.register({ userId: USER_ID, deviceName: 'Test browser' })

    expect(register).toHaveBeenCalledOnce()
    const request = register.mock.calls[0][0]
    expect(Base64.toUint8Array(request.identityX25519PublicKey)).toHaveLength(32)
    expect(Base64.toUint8Array(request.identityEd25519PublicKey)).toHaveLength(32)
    expect(Base64.toUint8Array(request.signedPublicPreKey)).toHaveLength(32)
    expect(Base64.toUint8Array(request.preKeySignature)).toHaveLength(64)
    expect(request.oneTimePublicPreKeys).toHaveLength(INITIAL_ONE_TIME_PRE_KEY_COUNT)
    expect(device.device.deviceId).toBe(DEVICE_ID)
    expect(device.device.activeSignedPreKeyId).toBe(SIGNED_PRE_KEY_ID)
    expect(device.signedPreKey.id).toBe(SIGNED_PRE_KEY_ID)
    expect(device.signedPreKey.id).not.toBe(device.device.deviceId)
    expect(device.signedPreKey.createdAt).toEqual(new Date(CREATED_AT))
    expect(device.signedPreKey.retiredAt).toBeNull()
    expect(device.oneTimePreKeys).toHaveLength(INITIAL_ONE_TIME_PRE_KEY_COUNT)
  })

  it('rejects a response that cannot be mapped to the generated one-time pre-keys', async () => {
    const response = createResponse()
    response.oneTimePreKeys.pop()
    const service = new DeviceRegistrationService({
      generateKeyMaterial: vi.fn().mockResolvedValue(material),
      register: vi.fn().mockResolvedValue(response),
    })

    await expect(service.register({ userId: USER_ID, deviceName: 'Test browser' })).rejects.toThrow(
      'unexpected one-time pre-key count'
    )
  })
})

function createResponse(): RegisterDeviceResponse {
  return {
    deviceId: DEVICE_ID,
    signedPreKeyId: SIGNED_PRE_KEY_ID,
    signedPreKeyCreatedAt: CREATED_AT,
    oneTimePreKeys: Array.from({ length: INITIAL_ONE_TIME_PRE_KEY_COUNT }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      createdAt: CREATED_AT,
    })),
  }
}
