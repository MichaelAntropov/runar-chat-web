import type { MessagePayload } from '../interfaces/message/MessagePayload'
import type { SendMessageResponse } from '../interfaces/message/SendMessageResponse'
import type {
  InitDeviceKeyBundle,
  InitDeviceKeyBundleResponse,
  InitKeyBundle,
  InitKeyBundleResponse,
} from '../interfaces/key-bundle/InitKeyBundleResponse'
import type { OfflineMessagesResponses } from '../interfaces/message/MessagesResponse'
import type {
  IdentityKeyResponse,
  IdentityKeysResponse,
} from '../interfaces/identity-key/IdentityKeysResponse'
import { http } from '@/core/api/httpClient'
import type { IdentityKey } from '../interfaces/identity-key/IdentityKey'
import { base64ToUint8Array } from '@/core/utils'
import type { OfflineMessage } from '../interfaces/message/OfflineMessage'
import type { AxiosPromise } from 'axios'

export const chatApi = {
  async getIdentityKeys(userId: string): Promise<IdentityKey[]> {
    const result = await http.get<IdentityKeysResponse>(`/api/v1/keys/identity-keys/${userId}`)

    return result.data.identityKeys.map(
      (identityKey: IdentityKeyResponse): IdentityKey => ({
        deviceId: identityKey.deviceId,
        x25519PublicKey: base64ToUint8Array(identityKey.x25519PublicKey),
        ed25519PublicKey: base64ToUint8Array(identityKey.ed25519PublicKey),
      }),
    )
  },

  async getKeyBundle(userId: string): Promise<InitKeyBundle> {
    const result = await http.get<InitKeyBundleResponse>(`/api/v1/keys/key-bundle/${userId}`)

    const parsedKeyBundles: InitDeviceKeyBundle[] = result.data.keyBundles.map(
      (keyBundle: InitDeviceKeyBundleResponse): InitDeviceKeyBundle => ({
        deviceId: keyBundle.deviceId,
        x25519identityKey: base64ToUint8Array(keyBundle.x25519identityKey),
        ed25519identityKey: base64ToUint8Array(keyBundle.ed25519identityKey),
        preKey: base64ToUint8Array(keyBundle.preKey),
        preKeySignature: base64ToUint8Array(keyBundle.preKeySignature),
        oneTimePreKeyId: keyBundle.oneTimePreKeyId,
        oneTimePreKey: base64ToUint8Array(keyBundle.oneTimePreKey),
      }),
    )

    return { keyBundles: parsedKeyBundles }
  },

  async postSendMessagePayload(payload: MessagePayload): AxiosPromise<SendMessageResponse> {
    return http.post<SendMessageResponse>('/api/v1/messages/send-message', payload)
  },

  async postReceiveOfflineMessages(deviceId: string): Promise<OfflineMessage[]> {
    const result = await http.post<OfflineMessagesResponses>(`/api/v1/messages/receive/${deviceId}`)

    return result.data.messages.map(
      (msg): OfflineMessage => ({
        messageId: msg.messageId,
        createdAt: msg.createdAt,
        senderId: msg.senderId,
        senderDeviceId: msg.senderDeviceId,
        preKeyIdUsed: msg.preKeyIdUsed,
        oneTimePreKeyIdUsed: msg.oneTimePreKeyIdUsed,
        senderEphemeralKey: msg.senderEphemeralKey
          ? base64ToUint8Array(msg.senderEphemeralKey)
          : null,
        cipherPayload: base64ToUint8Array(msg.cipherPayload),
        encryptedHeader: msg.encryptedHeader ? base64ToUint8Array(msg.encryptedHeader) : null,
      }),
    )
  },
}
