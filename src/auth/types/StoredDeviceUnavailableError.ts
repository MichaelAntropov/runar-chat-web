export class StoredDeviceUnavailableError extends Error {
  constructor() {
    super('The stored device is no longer available.')
    this.name = 'StoredDeviceUnavailableError'
  }
}
