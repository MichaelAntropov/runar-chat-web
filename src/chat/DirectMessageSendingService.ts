import { DeviceSetMismatchError } from '@/chat/types/message/DeviceSetMismatchError'
import type { MessagePayload } from '@/chat/types/message/MessagePayload'
import type { SendMessageResponse } from '@/chat/types/message/SendMessageResponse'
import type { DirectMessageCoordinator } from '@/sesame/direct-message/DirectMessageCoordinator'

import { directMessageToApiPayload } from './directMessageTransport'

const MAX_DEVICE_SET_RETRIES = 2

type SendingCoordinator = Pick<DirectMessageCoordinator, 'clearCachedUser' | 'encryptForUser'>

export class DirectMessageSendingService {
  constructor(
    private readonly coordinator: SendingCoordinator,
    private readonly sendPayload: (payload: MessagePayload) => Promise<SendMessageResponse>
  ) {}

  async send(recipientUserId: string, localUserId: string, plaintext: Uint8Array<ArrayBuffer>, retryCount = 0): Promise<SendMessageResponse | null> {
    const recipient = await this.coordinator.encryptForUser(recipientUserId, plaintext, {
      allowEmptyDeviceSet: recipientUserId === localUserId,
    })
    const localDeviceMessages =
      recipientUserId === localUserId
        ? []
        : (
            await this.coordinator.encryptForUser(localUserId, plaintext, {
              allowEmptyDeviceSet: true,
            })
          ).deviceMessages

    const deviceMessages = [
      ...recipient.deviceMessages.map((message) => directMessageToApiPayload(recipientUserId, message)),
      ...localDeviceMessages.map((message) => directMessageToApiPayload(localUserId, message)),
    ]
    if (deviceMessages.length === 0) return null

    try {
      return await this.sendPayload({ deviceMessages })
    } catch (error: unknown) {
      if (!(error instanceof DeviceSetMismatchError) || retryCount >= MAX_DEVICE_SET_RETRIES) {
        throw error
      }

      const affectedUserIds = new Set([recipientUserId, localUserId, ...Object.keys(error.missingDeviceIds), ...Object.keys(error.invalidDeviceIds)])
      for (const userId of affectedUserIds) this.coordinator.clearCachedUser(userId)

      return this.send(recipientUserId, localUserId, plaintext, retryCount + 1)
    }
  }
}
