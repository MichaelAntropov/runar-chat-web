import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'

import { decryptInboundMessageAndPushToChat, fetchAndProcessOfflineEvents, flushPendingReadReceipts } from '@/chat/ChatService'
import { useChatsStore } from '@/chat/chatStore'
import { inboundMessageFromWebsocketMessage, type InboundMessage } from '@/chat/types/message/InboundMessage'
import { deliveryReceiptFromResponse } from '@/chat/types/receipt/DeliveryReceipt'
import { runtimePolicy } from '@/core/config/runtimePolicy'
import { useDbStore, type DbStatus } from '@/db/dbStore'
import { useDeviceStore } from '@/device/deviceStore'
import type { DeviceRegistrationStatus } from '@/device/types/localDeviceTypes'
import { usePresenceStore } from '@/presence/presenceStore'
import { useUserStore } from '@/user/userStore'

import { WebsocketConnection, type WebSocketConnectionStatus } from './WebsocketConnection'
import type { DeviceRemovedWsMessage, DeliveryReceiptWsMessage, MessageWsMessage, PresenceWsMessage } from './wsEventTypes'

export const useConnectionStore = defineStore('connection-store', () => {
  const userStore = useUserStore()
  const deviceStore = useDeviceStore()
  const dbStore = useDbStore()

  const webSocketConnectionStatus: Ref<WebSocketConnectionStatus> = ref('none')

  const websocketConnection = new WebsocketConnection({
    onStatusChange: (status: WebSocketConnectionStatus) => {
      webSocketConnectionStatus.value = status
      if (status === 'connected') {
        void loadQueuedEvents()
          .then(() => flushPendingReadReceipts())
          .catch((error) => {
            console.error('[connection-store] - Failed to process queued messages:', error)
          })
      }
    },
    onMessage: (event: MessageEvent) => {
      const data: Record<string, unknown> = JSON.parse(event.data)

      if (data.type === 'device_removed') {
        const msg = data as Partial<DeviceRemovedWsMessage>
        const currentUserId = userStore.principal?.id
        const currentDeviceId = deviceStore.deviceId

        if (typeof msg.userId === 'string' && typeof msg.deviceId === 'string' && msg.userId === currentUserId && msg.deviceId === currentDeviceId) {
          websocketConnection.disconnect()
          userStore.handleDeviceRemoved()
        }
        return
      }

      if (data.type === 'PRESENCE') {
        const msg = data as unknown as PresenceWsMessage
        const presenceStore = usePresenceStore()
        presenceStore.handlePresenceUpdate(msg.payload)
        return
      }

      if (data.type === 'MESSAGE') {
        const msg = data as unknown as MessageWsMessage
        const inboundMessage: InboundMessage = inboundMessageFromWebsocketMessage(msg.payload)
        void decryptInboundMessageAndPushToChat(inboundMessage).catch((error) => {
          console.error('[connection-store] - Failed to process inbound message:', error)
        })
        return
      }

      if (data.type === 'DELIVERY_RECEIPT') {
        try {
          const msg = data as unknown as DeliveryReceiptWsMessage
          const receipt = deliveryReceiptFromResponse(msg.payload)
          const chatsStore = useChatsStore()
          void chatsStore.applyDeliveryReceipts([receipt]).catch((error) => {
            const details = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : error
            console.error('[connection-store] - Failed to process delivery receipt:', details)
          })
        } catch (error) {
          console.error('[connection-store] - Invalid delivery receipt received:', error)
        }
        return
      }

      console.error('[connection-store] - Unknown message type received:', JSON.stringify(data))
    },
    onTerminalClose: () => {
      if (userStore.isAuthenticated) {
        userStore.handleDeviceRemoved()
      }
    },
  })

  async function loadQueuedEvents() {
    const { registrationStatus, deviceId } = deviceStore
    const { isAuthenticated, authStatus } = userStore

    if (isAuthenticated && authStatus == 'upgraded' && registrationStatus === 'registered' && deviceId) {
      await fetchAndProcessOfflineEvents()
    }
  }

  watch(
    () => [userStore.isAuthenticated, userStore.authStatus, deviceStore.registrationStatus, deviceStore.deviceId, dbStore.dbStatus],
    ([isAuthenticated, authStatus, registrationStatus, deviceId, dbEncryptionStatus], oldValues = []) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [wasAuthenticated, prevAuthStatus, prevRegStatus, prevDeviceId, prevDbEncryptStatus] = oldValues as (
        | boolean
        | DeviceRegistrationStatus
        | DbStatus
        | string
        | null
        | undefined
      )[]

      const canConnect =
        runtimePolicy.directMessageReceivingEnabled &&
        isAuthenticated &&
        authStatus === 'upgraded' &&
        registrationStatus === 'registered' &&
        typeof deviceId === 'string' &&
        dbEncryptionStatus === 'ready'

      if (canConnect) {
        console.log('[connection-store] - Connect websocket.')
        websocketConnection.connect(deviceId, () => userStore.getAccessToken())
      } else {
        if (webSocketConnectionStatus.value !== 'none') {
          console.log('[connection-store] - Disconnect websocket.')
          websocketConnection.disconnect()
        }
      }
    },
    { immediate: true }
  )

  return {
    webSocketConnectionStatus,
  }
})
