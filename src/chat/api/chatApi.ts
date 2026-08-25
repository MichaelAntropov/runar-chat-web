import { isAxiosError } from 'axios'

import { http } from '@/core/api/httpClient'
import type { ApiErrorResponse } from '@/core/api/types/ApiErrorResponse'
import { base64ToUint8Array } from '@/core/utils'

import type { IdentityKey } from '../types/identity-key/IdentityKey'
import type {
  IdentityKeyResponse,
  IdentityKeysResponse,
} from '../types/identity-key/IdentityKeysResponse'
import type {
  InitDeviceKeyBundle,
  InitDeviceKeyBundleResponse,
  MultiUserInitKeyBundleResponse,
} from '../types/key-bundle/InitKeyBundleResponse'
import { DeviceSetMismatchError } from '../types/message/DeviceSetMismatchError'
import { MessageReceiverBlockedError } from '../types/message/MessageReceiverBlockedError'
import type { MessagePayload } from '../types/message/MessagePayload'
import type { ReceiveMessagesResponse } from '../types/message/MessagesResponse'
import type { OfflineMessage } from '../types/message/OfflineMessage'
import type { ReceivedMessages } from '../types/message/ReceivedMessages'
import type { SendMessageResponse } from '../types/message/SendMessageResponse'
import { deliveryReceiptFromResponse } from '../types/receipt/DeliveryReceipt'

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

  async getKeyBundles(
    userIdsAndDeviceIds: Record<string, string[]>,
  ): Promise<Map<string, Array<InitDeviceKeyBundle>>> {
    const result = await http.post<MultiUserInitKeyBundleResponse>(`/api/v1/keys/key-bundles`, {
      deviceIds: userIdsAndDeviceIds,
    })

    const parsed = new Map<string, Array<InitDeviceKeyBundle>>()

    for (const [userId, rawBundles] of Object.entries(result.data.userKeyBundles)) {
      const parsedKeyBundles = rawBundles.map((keyBundle: InitDeviceKeyBundleResponse) => ({
        deviceId: keyBundle.deviceId,
        x25519IdentityKey: base64ToUint8Array(keyBundle.x25519IdentityKey),
        ed25519IdentityKey: base64ToUint8Array(keyBundle.ed25519IdentityKey),
        signedPreKeyId: keyBundle.signedPreKeyId,
        signedPreKey: base64ToUint8Array(keyBundle.signedPreKey),
        signedPreKeySignature: base64ToUint8Array(keyBundle.signedPreKeySignature),
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
        const invalidDeviceError = errorResponse.errors.find((e) => e.code === 'INVALID_DEVICES')

        if (missingDeviceError || invalidDeviceError) {
          throw new DeviceSetMismatchError(
            parseDeviceIds(missingDeviceError?.data),
            parseDeviceIds(invalidDeviceError?.data),
          )
        }

        const receiverBlockedError = errorResponse.errors.find(
          (apiError) => apiError.code === 'MESSAGE_RECEIVER_BLOCKED',
        )

        if (receiverBlockedError) {
          throw new MessageReceiverBlockedError()
        }
      }

      throw error
    }
  },

  async postReceiveMessages(): Promise<ReceivedMessages> {
    const result = await http.post<ReceiveMessagesResponse>(`/api/v1/messages/receive`)

    const messages = result.data.messages.map(
      (msg): OfflineMessage => ({
        messageId: msg.messageId,
        createdAt: msg.createdAt,
        senderId: msg.senderId,
        senderDeviceId: msg.senderDeviceId,
        signedPreKeyIdUsed: msg.signedPreKeyIdUsed,
        oneTimePreKeyIdUsed: msg.oneTimePreKeyIdUsed,
        senderEphemeralKey: msg.senderEphemeralKey
          ? base64ToUint8Array(msg.senderEphemeralKey)
          : null,
        cipherPayload: base64ToUint8Array(msg.cipherPayload),
        encryptedHeader: msg.encryptedHeader ? base64ToUint8Array(msg.encryptedHeader) : null,
      }),
    )

    return {
      messages,
      deliveryReceipts: result.data.deliveryReceipts.map(deliveryReceiptFromResponse),
    }
  },
}

function parseDeviceIds(data: unknown): Record<string, string[]> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}

  return Object.fromEntries(
    Object.entries(data).flatMap(([userId, deviceIds]) => {
      if (!Array.isArray(deviceIds)) return []

      const validDeviceIds = [
        ...new Set(
          deviceIds.filter((deviceId): deviceId is string => typeof deviceId === 'string'),
        ),
      ]
      return validDeviceIds.length > 0 ? [[userId, validDeviceIds]] : []
    }),
  )
}
