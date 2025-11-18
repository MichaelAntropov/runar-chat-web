import {
  inboundMessageFromWebsocketMessage,
  type InboundMessage,
} from '@/chat/interfaces/message/InboundMessage'
import type { WebsocketMessage } from '@/chat/interfaces/message/WebsocketMessage'
import { useDeviceStore, type DeviceRegistrationStatus } from '@/device/DeviceStorage'
import { useUserStore } from '@/user/UserStorage'
import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import { WebsocketConnection, type WebSocketConnectionStatus } from './WebsocketConnection'
import {
  decryptInboundMessageAndPushToChat,
  fetchAndDecryptOfflineMessages,
} from '@/chat/chatService'

export const useConnectionStore = defineStore('connection-store', () => {
  const userStore = useUserStore()
  const deviceStore = useDeviceStore()

  const webSocketConnectionStatus: Ref<WebSocketConnectionStatus> = ref('none')

  const websocketConnection = new WebsocketConnection({
    onStatusChange: (status: WebSocketConnectionStatus) => {
      webSocketConnectionStatus.value = status
      if (status === 'connected') {
        loadOfflineMessages()
      }
    },
    onMessage: (event: MessageEvent) => {
      const websocketMessage: WebsocketMessage = JSON.parse(event.data)
      const inboundMessage: InboundMessage = inboundMessageFromWebsocketMessage(websocketMessage)
      decryptInboundMessageAndPushToChat(inboundMessage)
    },
  })

  async function loadOfflineMessages() {
    const { registrationStatus, deviceId } = deviceStore
    const { isAuthenticated } = userStore

    if (isAuthenticated && registrationStatus === 'registered' && deviceId) {
      await fetchAndDecryptOfflineMessages()
    }
  }

  watch(
    () => [userStore.isAuthenticated, deviceStore.registrationStatus, deviceStore.deviceId],
    ([isAuthenticated, registrationStatus, deviceId], oldValues = []) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [wasAuthenticated, prevRegStatus, _] = oldValues as (
        | boolean
        | DeviceRegistrationStatus
        | string
        | null
        | undefined
      )[]
      const canConnect =
        isAuthenticated && registrationStatus === 'registered' && typeof deviceId === 'string'

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
})
