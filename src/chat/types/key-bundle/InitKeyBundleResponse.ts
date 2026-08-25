export interface InitKeyBundleResponse {
  keyBundles: Array<InitDeviceKeyBundleResponse>
}

export interface MultiUserInitKeyBundleResponse {
  userKeyBundles: Record<string, Array<InitDeviceKeyBundleResponse>>
}

export interface InitDeviceKeyBundleResponse {
  deviceId: string

  x25519IdentityKey: string
  ed25519IdentityKey: string
  signedPreKeyId: string
  signedPreKey: string
  signedPreKeySignature: string

  oneTimePreKeyId: string | null
  oneTimePreKey: string | null
}

export interface InitKeyBundle {
  keyBundles: Array<InitDeviceKeyBundle>
}

export interface InitDeviceKeyBundle {
  deviceId: string

  x25519IdentityKey: Uint8Array<ArrayBuffer>
  ed25519IdentityKey: Uint8Array<ArrayBuffer>
  signedPreKeyId: string
  signedPreKey: Uint8Array<ArrayBuffer>
  signedPreKeySignature: Uint8Array<ArrayBuffer>

  oneTimePreKeyId: string | null
  oneTimePreKey: Uint8Array<ArrayBuffer> | null
}
