import type { MessagePayload } from '../interfaces/message/MessagePayload'
import type { SendMessageResponse } from '../interfaces/message/SendMessageResponse'
import type { InitKeyBundleResponse } from '../interfaces/key-bundle/InitKeyBundleResponse'
import type { OfflineMessagesResponses } from '../interfaces/message/MessagesResponse'
import type { IdentityKeysResponse } from '../interfaces/identity-key/IdentityKeysResponse'
import { http } from '@/core/api/httpClient'

export const chatApi = {
  async getIdentityKeys(userId: string) {
    return http.get<IdentityKeysResponse>(`/api/v1/keys/identity-keys/${userId}`)
  },

  async getKeyBundle(userId: string) {
    return http.get<InitKeyBundleResponse>(`/api/v1/keys/key-bundle/${userId}`)
  },

  async postSendMessagePayload(payload: MessagePayload) {
    return http.post<SendMessageResponse>('/api/v1/messages/send-message', payload)
  },

  async postReceiveOfflineMessages(deviceId: string) {
    return http.post<OfflineMessagesResponses>(`/api/v1/messages/receive/${deviceId}`)
  },
}
