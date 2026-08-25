import { describe, expect, it } from 'vitest'

import { getDeviceIdFromJwtToken } from '../userStore'

describe('getDeviceIdFromJwtToken', () => {
  it('reads a device ID from a base64url JWT payload', () => {
    const token = createToken({ deviceId: 'device-id', sub: 'user-id' })

    expect(getDeviceIdFromJwtToken(token)).toBe('device-id')
  })

  it('returns null for temporary or malformed tokens', () => {
    expect(getDeviceIdFromJwtToken(createToken({ sub: 'user-id' }))).toBeNull()
    expect(getDeviceIdFromJwtToken(createToken({ device_id: 'obsolete-device-id' }))).toBeNull()
    expect(getDeviceIdFromJwtToken('not-a-token')).toBeNull()
  })
})

function createToken(payload: Record<string, unknown>): string {
  const encoded = btoa(JSON.stringify(payload))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  return `header.${encoded}.signature`
}
