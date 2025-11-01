export interface InitKeyBundleResponse {
  keyBundles: Array<InitDeviceKeyBundleResponse>
}

export interface InitDeviceKeyBundleResponse {
  deviceId: string

  x25519identityKey: string
  ed25519identityKey: string
  preKey: string
  preKeySignature: string

  oneTimePreKeyId: string
  oneTimePreKey: string
}

export interface InitKeyBundle {
  keyBundles: Array<InitDeviceKeyBundle>
}

export interface InitDeviceKeyBundle {
  deviceId: string

  x25519identityKey: Uint8Array<ArrayBuffer>
  ed25519identityKey: Uint8Array<ArrayBuffer>
  preKey: Uint8Array<ArrayBuffer>
  preKeySignature: Uint8Array<ArrayBuffer>

  oneTimePreKeyId: string
  oneTimePreKey: Uint8Array<ArrayBuffer>
}
