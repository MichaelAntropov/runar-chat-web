import type { InboundMessage } from '@/chat/types/message/InboundMessage'
import type { DirectMessageCoordinator } from '@/sesame/direct-message/DirectMessageCoordinator'

import { directMessageFromInboundMessage } from './directMessageTransport'

type ReceivingCoordinator = Pick<DirectMessageCoordinator, 'decryptFromDevice'>

export class DirectMessageReceivingService {
  constructor(
    private readonly coordinator: ReceivingCoordinator,
    private readonly now: () => number = () => Date.now()
  ) {}

  async receive(message: InboundMessage): Promise<Uint8Array<ArrayBuffer> | null> {
    const decrypted = await this.coordinator.decryptFromDevice({
      senderUserId: message.senderId,
      senderDeviceId: message.senderDeviceId,
      encryptedMessage: directMessageFromInboundMessage(message),
      receivedAt: this.now(),
    })

    return decrypted?.plaintext ?? null
  }
}
