import {
  inboundMessageFromWebsocketMessage,
  type InboundMessage,
} from '@/chat/types/message/InboundMessage'
import { useDeviceStore, type DeviceRegistrationStatus } from '@/device/deviceStore'
import { useUserStore } from '@/user/userStore'
import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import { WebsocketConnection, type WebSocketConnectionStatus } from './WebsocketConnection'
import {
  decryptInboundMessageAndPushToChat,
  fetchAndDecryptOfflineMessages,
} from '@/chat/ChatService'
import { useDbStore, type DbStatus } from '@/db/dbStore'
import { usePresenceStore } from '@/presence/presenceStore'
import type { MessageWsMessage, PresenceWsMessage } from './wsEventTypes'

export const useConnectionStore = defineStore('connection-store', () => {
  const userStore = useUserStore()
  const deviceStore = useDeviceStore()
  const dbStore = useDbStore()

  const webSocketConnectionStatus: Ref<WebSocketConnectionStatus> = ref('none')

  const websocketConnection = new WebsocketConnection({
    onStatusChange: (status: WebSocketConnectionStatus) => {
      webSocketConnectionStatus.value = status
      if (status === 'connected') {
        loadOfflineMessages()
      }
    },
    onMessage: (event: MessageEvent) => {
      const data: Record<string, unknown> = JSON.parse(event.data)

      if (data.type === 'PRESENCE') {
        const msg = data as unknown as PresenceWsMessage
        const presenceStore = usePresenceStore()
        presenceStore.handlePresenceUpdate(msg.payload)
        return
      }

      if (data.type === 'MESSAGE') {
        const msg = data as unknown as MessageWsMessage
        const inboundMessage: InboundMessage = inboundMessageFromWebsocketMessage(msg.payload)
        decryptInboundMessageAndPushToChat(inboundMessage)
        return
      }

      console.error('[connection-store] - Unknown message type received:', JSON.stringify(data))
    },
  })

  async function loadOfflineMessages() {
    const { registrationStatus, deviceId } = deviceStore
    const { isAuthenticated, authStatus } = userStore

    if (
      isAuthenticated &&
      authStatus == 'upgraded' &&
      registrationStatus === 'registered' &&
      deviceId
    ) {
      await fetchAndDecryptOfflineMessages()
    }
  }

  watch(
    () => [
      userStore.isAuthenticated,
      userStore.authStatus,
      deviceStore.registrationStatus,
      deviceStore.deviceId,
      dbStore.dbStatus,
    ],
    (
      [isAuthenticated, authStatus, registrationStatus, deviceId, dbEncryptionStatus],
      oldValues = [],
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [wasAuthenticated, prevAuthStatus, prevRegStatus, prevDeviceId, prevDbEncryptStatus] =
        oldValues as (boolean | DeviceRegistrationStatus | DbStatus | string | null | undefined)[]

      const canConnect =
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
    { immediate: true },
  )

  return {
    webSocketConnectionStatus,
  }
})
