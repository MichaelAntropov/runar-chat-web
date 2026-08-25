import type { DoubleRatchetSkippedMessageKeys, DoubleRatchetState } from '@/crypto/double-ratchet/doubleRatchetTypes'

export interface DirectMessageSessionState {
  readonly ratchetState: DoubleRatchetState
  readonly skippedMessageKeys: DoubleRatchetSkippedMessageKeys
}
