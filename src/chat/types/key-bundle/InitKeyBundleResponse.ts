export interface InitKeyBundleResponse {
  keyBundles: Array<InitDeviceKeyBundleResponse>
}

export interface MultiUserInitKeyBundleResponse {
  userKeyBundles: Record<string, Array<InitDeviceKeyBundleResponse>>
}

export interface InitDeviceKeyBundleResponse {
  deviceId: string

  x25519identityKey: string
  ed25519identityKey: string
  preKey: string
  preKeySignature: string

  oneTimePreKeyId: string | null
  oneTimePreKey: string | null
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

  oneTimePreKeyId: string | null
  oneTimePreKey: Uint8Array<ArrayBuffer> | null
}
