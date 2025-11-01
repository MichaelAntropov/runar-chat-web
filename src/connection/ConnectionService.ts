import { useChatService } from '@/chat/ChatService'
import {
  inboundMessageFromWebsocketMessage,
  type InboundMessage,
} from '@/chat/interfaces/message/InboundMessage'
import type { WebsocketMessage } from '@/chat/interfaces/message/WebsocketMessage'
import { useDeviceStore, type DeviceRegistrationStatus } from '@/device/DeviceStorage'
import { useUserStore } from '@/user/UserStorage'
import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'

type WebSocketConnectionStatus = 'none' | 'initialized' | 'connected' | 'closed' | 'error'

export const useConnectionService = defineStore('connection-service', () => {
  const userStore = useUserStore()
  const deviceStore = useDeviceStore()
  const chatService = useChatService()

  const webSocketConnectionStatus: Ref<WebSocketConnectionStatus> = ref('none')

  let chatWebsocket: WebSocket | undefined

  const maxReconnectAttempts = 20
  const reconnectInitialDelay = 1000 // Start with 1 second
  const reconnectMaxDelay = 10000 // Cap at 10 seconds
  const reconnectAttempts = ref(0)
  let reconnectTimer: number | undefined

  async function loadOfflineMessages(
    registrationStatus: DeviceRegistrationStatus,
    deviceId: string | null,
    isAuthenticated: boolean,
  ) {
    if (!isAuthenticated || registrationStatus !== 'registered' || !deviceId) {
      return
    }

    await chatService.fetchAndDecryptOfflineMessages()
  }

  async function establishChatWebsocket(
    registrationStatus: DeviceRegistrationStatus,
    deviceId: string | null,
    isAuthenticated: boolean,
  ) {
    if (!isAuthenticated || registrationStatus !== 'registered' || !deviceId || chatWebsocket) {
      return
    }

    console.log('[connection-service] - Attempting to establish WebSocket connection...')

    try {
      const quarkusHeaderProtocol: string = encodeURIComponent(
        'chat-secure-http-upgrade#Authorization#Bearer ' + (await userStore.getAccessToken()),
      )

      chatWebsocket = new WebSocket(`/ws/v1/connection/${deviceId}`, [
        'bearer-token-carrier',
        quarkusHeaderProtocol,
      ])

      webSocketConnectionStatus.value = 'initialized'

      chatWebsocket.addEventListener('open', (event: Event) => {
        console.log('[connection-service] - WebSocket opened: ', event)
        webSocketConnectionStatus.value = 'connected'
      })

      chatWebsocket.addEventListener('error', (event: Event) => {
        console.error('[connection-service] - WebSocket error: ', event)
        webSocketConnectionStatus.value = 'error'
      })

      chatWebsocket.addEventListener('close', () => {
        console.log('[connection-service] - The connection has been closed.')
        webSocketConnectionStatus.value = 'closed'
        chatWebsocket = undefined
      })

      chatWebsocket.addEventListener('message', (event: MessageEvent) => {
        console.log('[connection-service] - WebSocket message received.')
        const websocketMessage: WebsocketMessage = JSON.parse(event.data)
        const inboundMessage: InboundMessage = inboundMessageFromWebsocketMessage(websocketMessage)
        chatService.decryptInboundMessageAndPushToChat(inboundMessage)
      })
    } catch (error) {
      console.error('[connection-service] - Failed to establish WebSocket:', error)
      webSocketConnectionStatus.value = 'error'
      chatWebsocket = undefined
    }
  }

  watch(
    () => [deviceStore.registrationStatus, deviceStore.deviceId],
    ([newRegistrationStatus, newDeviceId]) => {
      establishChatWebsocket(
        newRegistrationStatus as DeviceRegistrationStatus,
        newDeviceId,
        userStore.isAuthenticated,
      )
      loadOfflineMessages(
        newRegistrationStatus as DeviceRegistrationStatus,
        newDeviceId,
        userStore.isAuthenticated,
      )
    },
    { immediate: true },
  )

  watch(
    () => [userStore.isAuthenticated],
    () => {
      establishChatWebsocket(
        deviceStore.registrationStatus,
        deviceStore.deviceId,
        userStore.isAuthenticated,
      )
      loadOfflineMessages(
        deviceStore.registrationStatus,
        deviceStore.deviceId,
        userStore.isAuthenticated,
      )
    },
    { immediate: true },
  )

  watch(webSocketConnectionStatus, (newStatus, oldStatus) => {
    if (oldStatus === 'connected' && newStatus === 'closed') {
      console.log(
        '[connection-service] - Connection closed. Scheduling a reconnect in 3 seconds...',
      )

      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }

      reconnectTimer = setTimeout(() => {
        console.log('[connection-service] - Reconnecting...')
        establishChatWebsocket(
          deviceStore.registrationStatus,
          deviceStore.deviceId,
          userStore.isAuthenticated,
        )
      }, 3000)
    }
  })

  watch(webSocketConnectionStatus, (newStatus, oldStatus) => {
    if (oldStatus === 'connected' && (newStatus === 'closed' || newStatus === 'error')) {
      console.log('[connection-service] - Connection lost. Starting reconnect process...')
      reconnectAttempts.value = 0
      scheduleReconnect()
    } else if (
      reconnectAttempts.value > 0 &&
      reconnectAttempts.value < maxReconnectAttempts &&
      (newStatus === 'closed' || newStatus === 'error')
    ) {
      scheduleReconnect()
    } else if (newStatus === 'connected') {
      if (reconnectAttempts.value > 0) {
        console.log('[connection-service] - Successfully reconnected. Stopping retry attempts.')
      }
      reconnectAttempts.value = 0
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
    }
  })

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)

    if (!userStore.isAuthenticated) {
      console.log(`[connection-service] - User not authenticated reconnection cancelled.`)
      return
    }

    if (reconnectAttempts.value >= maxReconnectAttempts) {
      console.error(
        `[connection-service] - Max reconnect attempts (${maxReconnectAttempts}) reached.`,
      )
      return
    }

    reconnectAttempts.value++
    const delay = getNextDelay()

    console.log(
      `[connection-service] - Scheduling reconnect attempt ${reconnectAttempts.value}/${maxReconnectAttempts} in ${(delay / 1000).toFixed(1)} seconds...`,
    )

    reconnectTimer = setTimeout(() => {
      console.log(
        `[connection-service] - Executing reconnect attempt ${reconnectAttempts.value}...`,
      )
      establishChatWebsocket(
        deviceStore.registrationStatus,
        deviceStore.deviceId,
        userStore.isAuthenticated,
      )
    }, delay)
  }

  function getNextDelay(): number {
    const exponentialDelay = reconnectInitialDelay * Math.pow(2, reconnectAttempts.value)
    const delay = Math.min(exponentialDelay, reconnectMaxDelay)
    const jitter = delay * 0.2 * Math.random() // Add up to 20% jitter
    return delay + jitter
  }
})
