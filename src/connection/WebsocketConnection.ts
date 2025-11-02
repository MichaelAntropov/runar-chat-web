export type WebSocketConnectionStatus = 'none' | 'initialized' | 'connected' | 'closed' | 'error'

interface WebsocketServiceOptions {
  onStatusChange: (status: WebSocketConnectionStatus) => void
  onMessage: (message: MessageEvent) => void
}

export class WebsocketConnection {
  private socket: WebSocket | undefined
  private status: WebSocketConnectionStatus = 'none'

  private readonly maxReconnectAttempts = 20
  private readonly reconnectInitialDelay = 1000 // 1 second
  private readonly reconnectMaxDelay = 10000 // 10 seconds

  private reconnectAttempts = 0
  private reconnectTimer: number | undefined

  private deviceId: string | null = null
  private getAccessToken: (() => Promise<string>) | null = null

  private onStatusChange: (status: WebSocketConnectionStatus) => void
  private onMessage: (message: MessageEvent) => void

  constructor(options: WebsocketServiceOptions) {
    this.onStatusChange = options.onStatusChange
    this.onMessage = options.onMessage
  }

  public async connect(deviceId: string, getAccessToken: () => Promise<string>): Promise<void> {
    this.deviceId = deviceId
    this.getAccessToken = getAccessToken

    if (this.socket || this.status === 'initialized' || this.status === 'connected') {
      console.log(
        '[websocket-service] - Connection attempt ignored, already connected or connecting.',
      )
      return
    }

    console.log('[websocket-service] - Attempting to establish WebSocket connection...')

    try {
      const token = await getAccessToken()
      const chatSecureHeaderProtocol: string = encodeURIComponent(
        `chat-secure-http-upgrade#Authorization#Bearer ${token}`,
      )

      this.socket = new WebSocket(`/ws/v1/connection/${deviceId}`, [
        'bearer-token-carrier',
        chatSecureHeaderProtocol,
      ])
      this.updateStatus('initialized')

      this.socket.addEventListener('open', this.handleOpen)
      this.socket.addEventListener('error', this.handleError)
      this.socket.addEventListener('close', this.handleClose)
      this.socket.addEventListener('message', this.handleMessage)
    } catch (error) {
      console.error('[websocket-service] - Failed to establish WebSocket:', error)
      this.handleError() // Trigger error state and reconnect logic
    }
  }

  public disconnect(): void {
    console.log('[websocket-service] - Disconnecting WebSocket.')
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.reconnectAttempts = 0

    if (this.socket) {
      // Unsubscribe from events to prevent handleClose from triggering a reconnect
      this.socket.removeEventListener('open', this.handleOpen)
      this.socket.removeEventListener('error', this.handleError)
      this.socket.removeEventListener('close', this.handleClose)
      this.socket.removeEventListener('message', this.handleMessage)
      this.socket.close()
      this.socket = undefined
    }

    this.updateStatus('closed')
  }

  private updateStatus = (newStatus: WebSocketConnectionStatus): void => {
    if (this.status === newStatus) return
    console.log(`[websocket-service] - Status changed from '${this.status}' to '${newStatus}'.`)
    this.status = newStatus
    this.onStatusChange(this.status)
  }

  private handleOpen = (event: Event): void => {
    console.log('[websocket-service] - WebSocket opened: ', event)
    this.updateStatus('connected')

    this.reconnectAttempts = 0
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  private handleError = (event?: Event): void => {
    if (event) console.error('[websocket-service] - WebSocket error: ', event)
    this.updateStatus('error')
    this.cleanupSocket()
    this.scheduleReconnect()
  }

  private handleClose = (): void => {
    console.log('[websocket-service] - The connection has been closed.')
    this.updateStatus('closed')
    this.cleanupSocket()
    this.scheduleReconnect()
  }

  private cleanupSocket = (): void => {
    if (this.socket) {
      this.socket.removeEventListener('open', this.handleOpen)
      this.socket.removeEventListener('error', this.handleError)
      this.socket.removeEventListener('close', this.handleClose)
      this.socket.removeEventListener('message', this.handleMessage)
      this.socket = undefined
    }
  }

  private handleMessage = (event: MessageEvent): void => {
    console.log('[websocket-service] - WebSocket message received.')
    try {
      this.onMessage(event)
    } catch (error) {
      console.error('[websocket-service] - Error processing incoming message:', error)
    }
  }

  private scheduleReconnect = (): void => {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `[websocket-service] - Max reconnect attempts (${this.maxReconnectAttempts}) reached. Stopping.`,
      )
      return
    }

    this.reconnectAttempts++
    const delay = this.getNextDelay()

    console.log(
      `[websocket-service] - Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${(delay / 1000).toFixed(1)} seconds...`,
    )

    this.reconnectTimer = setTimeout(() => {
      console.log(`[websocket-service] - Executing reconnect attempt ${this.reconnectAttempts}...`)
      if (this.deviceId && this.getAccessToken) {
        this.connect(this.deviceId, this.getAccessToken)
      } else {
        console.warn('[websocket-service] - Cannot reconnect, deviceId or token getter is missing.')
      }
    }, delay)
  }

  private getNextDelay(): number {
    const exponentialDelay = this.reconnectInitialDelay * Math.pow(2, this.reconnectAttempts)
    const delay = Math.min(exponentialDelay, this.reconnectMaxDelay)
    const jitter = delay * 0.2 * Math.random() // Add up to 20% jitter
    return delay + jitter
  }
}
