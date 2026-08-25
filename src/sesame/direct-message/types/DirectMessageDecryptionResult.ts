import type { SesameDeviceSetChange } from '@/sesame/types/sesameTypes'

export interface DirectMessageDecryptionResult {
  readonly plaintext: Uint8Array<ArrayBuffer>
  readonly sessionId: string
  readonly sessionCreated: boolean
  readonly deviceChange: SesameDeviceSetChange | null
}
