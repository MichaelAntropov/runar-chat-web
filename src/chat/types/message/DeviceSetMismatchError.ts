export class DeviceSetMismatchError extends Error {
  public readonly missingDeviceIds: Record<string, string[]>

  public readonly invalidDeviceIds: Record<string, string[]>

  constructor(
    missingDeviceIds: Record<string, string[]>,
    invalidDeviceIds: Record<string, string[]>,
  ) {
    super('Message delivery failed because the device set is stale.')
    this.name = 'DeviceSetMismatchError'
    this.missingDeviceIds = missingDeviceIds
    this.invalidDeviceIds = invalidDeviceIds
  }
}
