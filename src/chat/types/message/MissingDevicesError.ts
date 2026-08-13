export class MissingDevicesError extends Error {
  public deviceIds: Record<string, string[]>

  constructor(deviceIds: Record<string, string[]>) {
    super('Message delivery failed due to missing device sessions.')
    this.name = 'MissingDevicesError'
    this.deviceIds = deviceIds
  }
}
