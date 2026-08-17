import { createSHA512 } from 'hash-wasm'

import type { IdentityKey } from '../types/identity-key/IdentityKey'

export interface SafetyNumberAccount {
  userId: string
  identityKeys: readonly IdentityKey[]
}

const FINGERPRINT_ITERATIONS = 5200
const KEY_SIZE_BYTES = 32
const DEVICE_FINGERPRINT_DOMAIN = new TextEncoder().encode('runar-device-identity-v1')
const SAFETY_NUMBER_DOMAIN = new TextEncoder().encode('runar-e2ee-safety-number-v1')

export async function generateSafetyNumber(
  firstAccount: SafetyNumberAccount,
  secondAccount: SafetyNumberAccount,
) {
  const hasher = await createSHA512()
  const accountResults = [firstAccount, secondAccount].map((account) => {
    const accountIdentity = encodeAccountIdentity(account)
    let fingerprint = hash(accountIdentity)

    for (let iteration = 1; iteration < FINGERPRINT_ITERATIONS; iteration++) {
      fingerprint = hash(concatBytes([fingerprint, accountIdentity]))
    }

    const devices = account.identityKeys
      .map((identityKey) => ({
        deviceId: identityKey.deviceId,
        fingerprint: fingerprintToNumericGroups(
          hash(concatBytes([DEVICE_FINGERPRINT_DOMAIN, encodeDeviceIdentityKeys(identityKey)])),
          4,
        ).join(' '),
      }))
      .sort((left, right) => left.deviceId.localeCompare(right.deviceId))

    return {
      fingerprint: fingerprintToNumericGroups(fingerprint, 6).join(''),
      devices,
    }
  })

  const accountFingerprints = accountResults.map((account) => account.fingerprint).sort()
  return {
    safetyNumber: accountFingerprints.join(''),
    firstAccountDevices: accountResults[0].devices,
    secondAccountDevices: accountResults[1].devices,
  }

  function hash(value: Uint8Array): Uint8Array {
    return hasher.init().update(value).digest('binary')
  }
}

function encodeAccountIdentity(account: SafetyNumberAccount): Uint8Array {
  if (!account.userId || account.identityKeys.length === 0) {
    throw new Error('Cannot generate a Safety Number without an account and identity keys.')
  }

  const deviceIdentityKeys = account.identityKeys.map(encodeDeviceIdentityKeys)
  deviceIdentityKeys.sort(compareBytes)

  const encodedUserId = new TextEncoder().encode(account.userId)
  return concatBytes([
    SAFETY_NUMBER_DOMAIN,
    encodeLength(encodedUserId.length),
    encodedUserId,
    encodeLength(deviceIdentityKeys.length),
    ...deviceIdentityKeys,
  ])
}

function encodeDeviceIdentityKeys(identityKey: IdentityKey): Uint8Array {
  if (
    identityKey.x25519PublicKey.length !== KEY_SIZE_BYTES ||
    identityKey.ed25519PublicKey.length !== KEY_SIZE_BYTES
  ) {
    throw new Error('Identity public keys must be 32 bytes.')
  }

  return concatBytes([identityKey.x25519PublicKey, identityKey.ed25519PublicKey])
}

function fingerprintToNumericGroups(fingerprint: Uint8Array, groupCount: number): string[] {
  const groups: string[] = []

  for (let offset = 0; offset < groupCount * 5; offset += 5) {
    let value = 0n
    for (let index = offset; index < offset + 5; index++) {
      value = (value << 8n) | BigInt(fingerprint[index])
    }
    groups.push((value % 100000n).toString().padStart(5, '0'))
  }

  return groups
}

function encodeLength(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, false)
  return bytes
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0

  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const sharedLength = Math.min(left.length, right.length)
  for (let index = 0; index < sharedLength; index++) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return left.length - right.length
}
