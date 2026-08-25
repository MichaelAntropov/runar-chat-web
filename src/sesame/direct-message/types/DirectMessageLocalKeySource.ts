import type { DirectMessageLocalOneTimePreKey } from './DirectMessageLocalOneTimePreKey'
import type { DirectMessageLocalSignedPreKey } from './DirectMessageLocalSignedPreKey'

export interface DirectMessageLocalKeySource {
  getSignedPreKey(id: string): Promise<DirectMessageLocalSignedPreKey | null>
  getOneTimePreKey(id: string): Promise<DirectMessageLocalOneTimePreKey | null>
}
