export interface IdentityKeysResponse {
  identityKeys: Array<IdentityKeyResponse>
}

export interface IdentityKeyResponse {
  deviceId: string
  x25519PublicKey: string
  ed25519PublicKey: string
}
