export class MissingDevicesError extends Error {
  public deviceIds: Map<string, Array<string>>

  constructor(deviceIds: Map<string, Array<string>>) {
    super('Message delivery failed due to missing device sessions.')
    this.name = 'MissingDevicesError'
    this.deviceIds = deviceIds
  }
}
