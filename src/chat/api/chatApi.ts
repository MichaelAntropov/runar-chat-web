import type { MessagePayload } from '../types/message/MessagePayload'
import type { SendMessageResponse } from '../types/message/SendMessageResponse'
import type {
  InitDeviceKeyBundle,
  InitDeviceKeyBundleResponse,
  InitKeyBundle,
  InitKeyBundleResponse,
  MultiUserInitKeyBundleResponse,
} from '../types/key-bundle/InitKeyBundleResponse'
import type { OfflineMessagesResponses } from '../types/message/MessagesResponse'
import type {
  IdentityKeyResponse,
  IdentityKeysResponse,
} from '../types/identity-key/IdentityKeysResponse'
import { http } from '@/core/api/httpClient'
import type { IdentityKey } from '../types/identity-key/IdentityKey'
import { base64ToUint8Array } from '@/core/utils'
import type { OfflineMessage } from '../types/message/OfflineMessage'
import { isAxiosError } from 'axios'
import type { ApiErrorResponse } from '@/core/api/types/ApiErrorResponse'
import { MissingDevicesError } from '../types/message/MissingDevicesError'

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
        oneTimePreKey: keyBundle.oneTimePreKey ? base64ToUint8Array(keyBundle.oneTimePreKey) : null,
      }),
    )

    return { keyBundles: parsedKeyBundles }
  },

  async getKeyBundles(
    userIdsAndDeviceIds: Map<string, Array<string>>,
  ): Promise<Map<string, Array<InitDeviceKeyBundle>>> {
    const result = await http.post<MultiUserInitKeyBundleResponse>(`/api/v1/keys/key-bundles`, {
      deviceIds: userIdsAndDeviceIds,
    })

    const parsed = new Map<string, Array<InitDeviceKeyBundle>>()

    for (const [userId, rawBundles] of Object.entries(result.data.userKeyBundles)) {
      const parsedKeyBundles = rawBundles.map((keyBundle: InitDeviceKeyBundleResponse) => ({
        deviceId: keyBundle.deviceId,
        x25519identityKey: base64ToUint8Array(keyBundle.x25519identityKey),
        ed25519identityKey: base64ToUint8Array(keyBundle.ed25519identityKey),
        preKey: base64ToUint8Array(keyBundle.preKey),
        preKeySignature: base64ToUint8Array(keyBundle.preKeySignature),
        oneTimePreKeyId: keyBundle.oneTimePreKeyId,
        oneTimePreKey: keyBundle.oneTimePreKey ? base64ToUint8Array(keyBundle.oneTimePreKey) : null,
      }))

      parsed.set(userId, parsedKeyBundles)
    }

    return parsed
  },

  async postSendMessagePayload(payload: MessagePayload): Promise<SendMessageResponse> {
    try {
      const response = await http.post<SendMessageResponse>(
        '/api/v1/messages/send-message',
        payload,
      )
      return response.data
    } catch (error) {
      if (isAxiosError(error) && error.response && error.response.data) {
        const errorResponse = error.response.data as ApiErrorResponse

        const missingDeviceError = errorResponse.errors.find((e) => e.code === 'MISSING_DEVICES')

        if (missingDeviceError) {
          const data = missingDeviceError.data as Map<string, Array<string>> | undefined
          const deviceIds = data ?? new Map<string, Array<string>>()
          throw new MissingDevicesError(deviceIds)
        }
      }

      throw error
    }
  },

  async postReceiveOfflineMessages(): Promise<OfflineMessage[]> {
    const result = await http.post<OfflineMessagesResponses>(`/api/v1/messages/receive`)

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
