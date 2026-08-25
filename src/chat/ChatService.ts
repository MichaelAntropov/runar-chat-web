import type { Chat } from '@/chat/types/chat/Chat'
import type { StoredMessage } from '@/chat/types/chat/StoredMessage'
import { contactApi } from '@/contacts/contactApi'
import { useContactsStore } from '@/contacts/contactStore'
import type { FoundUser } from '@/contacts/types/FindUserResponse'
import { runtimePolicy } from '@/core/config/runtimePolicy'
import { parseUtcTimestamp } from '@/core/utils'
import { pendingReadReceiptRepository } from '@/db/repositories/PendingReadReceiptRepository'
import { useSettingsStore } from '@/settings/settingsStore'
import { useUserStore } from '@/user/userStore'

import { useDeviceStore } from '../device/deviceStore'

import { chatApi } from './api/chatApi'
import { useChatsStore } from './chatStore'
import {
  getDirectMessageReceivingService,
  getDirectMessageSendingService,
} from './directMessageCoordinator'
import type { NoOpMessage } from './types/chat/NoOpMessage'
import type { ReadReceiptMessage } from './types/chat/ReadReceiptMessage'
import type { TextMessage } from './types/chat/TextMessage'
import type { InboundMessage } from './types/message/InboundMessage'
import { MessageReceiverBlockedError } from './types/message/MessageReceiverBlockedError'
import type { ReadReceipt } from './types/receipt/ReadReceipt'

const MAX_READ_RECEIPTS_PER_MESSAGE = 100
const READ_RECEIPT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let directMessageQueue: Promise<void> = Promise.resolve()
let receiptFlushPromise: Promise<void> | null = null
let receiptFlushRequested = false

function enqueueDirectMessageOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = directMessageQueue.then(operation, operation)
  directMessageQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

async function areReadReceiptsEnabled(chat: Chat): Promise<boolean> {
  const mode = await useSettingsStore().ensureReadReceiptModeLoaded()
  return mode === 'ALL' || (mode === 'PER_USER' && chat.readReceiptsEnabled)
}

function getOrCreateSavedMessagesChat(): Chat | null {
  const userStore = useUserStore()
  const chatStore = useChatsStore()

  if (!userStore.principal) {
    console.error('getOrCreateSavedMessagesChat() - No authenticated principal.')
    return null
  }

  const contact = {
    userId: userStore.principal.id,
    username: userStore.principal.name,
  }
  return chatStore.createNewChatFromContact(contact)
}

export function openSavedMessagesChat(): Chat | null {
  const chatStore = useChatsStore()
  const chat = getOrCreateSavedMessagesChat()
  if (!chat) return null

  chatStore.changeCurrentChat(chat.id)
  return chat
}

/**
 * Encrypts and sends a message to the user in the currently selected chat.
 * @param content The string content to send.
 */
export async function sendMessageInCurrentChat(content: string): Promise<void> {
  return enqueueDirectMessageOperation(() => sendMessageInCurrentChatInternal(content))
}

async function sendMessageInCurrentChatInternal(content: string): Promise<void> {
  const userStore = useUserStore()
  const deviceStore = useDeviceStore()
  const chatStore = useChatsStore()

  if (!userStore.principal || !deviceStore.deviceId) {
    console.log('sendMessageInCurrentChat() - No principal/device setup!')
    return
  }
  if (!chatStore.currentChat) {
    console.log('sendMessageInCurrentChat() - No current chat selected!')
    return
  }

  const chat: Chat = chatStore.currentChat
  console.log(
    `sendMessageInCurrentChat() - Sending message in chat(${chat.id}) to ${chat.contact.username}`,
  )

  const textMessage: TextMessage = {
    type: 'TEXT',
    ultimateReceiverId: chat.contact.userId,
    content,
  }

  const plaintext = Uint8Array.from(new TextEncoder().encode(JSON.stringify(textMessage)))
  const response = await getDirectMessageSendingService().send(
    chat.contact.userId,
    userStore.principal.id,
    plaintext,
  )

  if (response === null) {
    const createdAt = Date.now()
    const localMessage: StoredMessage = {
      id: crypto.randomUUID(),
      chatId: chat.id,
      senderId: userStore.principal.id,
      recipientId: userStore.principal.id,
      createdAt,
      content,
      deliveredAt: null,
      readAt: createdAt,
    }
    await chatStore.addMessageToChat(chat, localMessage)
    return
  }

  console.log(`sendMessageInCurrentChat() - Send message response: `, response)

  const newStoredMessage: StoredMessage = {
    id: response.messageId,
    chatId: chat.id,
    senderId: userStore.principal.id,
    recipientId: chat.contact.userId,
    createdAt: parseUtcTimestamp(response.createdAt),
    content,
    deliveredAt: null,
    readAt: null,
  }
  await chatStore.addMessageToChat(chat, newStoredMessage)
}

export async function queueReadReceipts(chat: Chat, receipts: ReadReceipt[]): Promise<void> {
  if (!runtimePolicy.directMessageReadReceiptsEnabled) return
  const principalId = useUserStore().principal?.id
  if (
    !principalId ||
    chat.contact.userId === principalId ||
    receipts.length === 0 ||
    !(await areReadReceiptsEnabled(chat))
  ) {
    return
  }

  const expiresAt = Date.now() + READ_RECEIPT_LIFETIME_MS
  await pendingReadReceiptRepository.save(
    receipts.map((receipt) => ({
      messageId: receipt.messageId,
      chatId: chat.id,
      readAt: receipt.readAt,
      expiresAt,
    })),
  )
  await flushPendingReadReceipts()
}

export async function flushPendingReadReceipts(): Promise<void> {
  if (!runtimePolicy.directMessageReadReceiptsEnabled) return
  if (receiptFlushPromise) {
    receiptFlushRequested = true
    return receiptFlushPromise
  }

  receiptFlushPromise = flushPendingReadReceiptsInternal().finally(() => {
    receiptFlushPromise = null
    if (receiptFlushRequested) {
      receiptFlushRequested = false
      void flushPendingReadReceipts()
    }
  })
  return receiptFlushPromise
}

async function flushPendingReadReceiptsInternal(): Promise<void> {
  const settingsStore = useSettingsStore()
  const userStore = useUserStore()
  const chatStore = useChatsStore()
  const principalId = userStore.principal?.id
  const mode = await settingsStore.ensureReadReceiptModeLoaded()
  if (!principalId || mode === 'NONE') {
    await pendingReadReceiptRepository.clear()
    return
  }

  const now = Date.now()
  const pendingReceipts = await pendingReadReceiptRepository.getAll()
  const expiredIds = pendingReceipts
    .filter((receipt) => receipt.expiresAt <= now)
    .map((receipt) => receipt.messageId)
  await pendingReadReceiptRepository.deleteByMessageIds(expiredIds)

  const validReceipts = pendingReceipts.filter((receipt) => receipt.expiresAt > now)
  const receiptsByChat = new Map<string, typeof validReceipts>()
  for (const receipt of validReceipts) {
    const chatReceipts = receiptsByChat.get(receipt.chatId) ?? []
    chatReceipts.push(receipt)
    receiptsByChat.set(receipt.chatId, chatReceipts)
  }

  for (const [chatId, chatReceipts] of receiptsByChat.entries()) {
    const chat = chatStore.chats.find((candidate) => candidate.id === chatId)
    if (!chat) continue
    if (chat.contact.userId === principalId) {
      await pendingReadReceiptRepository.deleteByMessageIds(
        chatReceipts.map((receipt) => receipt.messageId),
      )
      continue
    }
    if (!(await areReadReceiptsEnabled(chat))) {
      await pendingReadReceiptRepository.deleteByMessageIds(
        chatReceipts.map((receipt) => receipt.messageId),
      )
      continue
    }

    for (let index = 0; index < chatReceipts.length; index += MAX_READ_RECEIPTS_PER_MESSAGE) {
      const batch = chatReceipts.slice(index, index + MAX_READ_RECEIPTS_PER_MESSAGE)
      try {
        const sent = await enqueueDirectMessageOperation(async () => {
          if (!(await areReadReceiptsEnabled(chat))) return false

          const receiptMessage: ReadReceiptMessage = {
            type: 'READ_RECEIPT',
            ultimateReceiverId: chat.contact.userId,
            receipts: batch.map(({ messageId, readAt }) => ({ messageId, readAt })),
          }
          const noOpMessage: NoOpMessage = {
            type: 'NO_OP',
            ultimateReceiverId: principalId,
          }

          const encoder = new TextEncoder()
          await getDirectMessageSendingService().sendWithLocalDeviceCopy(
            chat.contact.userId,
            principalId,
            Uint8Array.from(encoder.encode(JSON.stringify(receiptMessage))),
            Uint8Array.from(encoder.encode(JSON.stringify(noOpMessage))),
          )
          return true
        })

        if (!sent) {
          await pendingReadReceiptRepository.deleteByMessageIds(
            chatReceipts.map((receipt) => receipt.messageId),
          )
          break
        }
        await pendingReadReceiptRepository.deleteByMessageIds(
          batch.map((receipt) => receipt.messageId),
        )
      } catch (error) {
        if (error instanceof MessageReceiverBlockedError) {
          await pendingReadReceiptRepository.deleteByMessageIds(
            batch.map((receipt) => receipt.messageId),
          )
          continue
        }
        console.error(`[readReceipts] Failed to send receipt batch for chat=${chatId}:`, error)
      }
    }
  }
}

/**
 * Fetches queued delivery receipts and messages, then reconciles or decrypts them.
 */
export async function fetchAndProcessOfflineEvents() {
  if (!runtimePolicy.directMessageReceivingEnabled) return
  const deviceStore = useDeviceStore()
  if (!deviceStore.deviceId) {
    console.warn('fetchAndProcessOfflineEvents() - No device setup!')
    return
  }

  console.log('fetchAndProcessOfflineEvents() - Fetching queued events...')

  const { messages, deliveryReceipts } = await chatApi.postReceiveMessages()
  await useChatsStore().applyDeliveryReceipts(deliveryReceipts)

  messages.sort(
    (msgA, msgB) => parseUtcTimestamp(msgA.createdAt) - parseUtcTimestamp(msgB.createdAt),
  )

  for (const msg of messages) {
    console.log(`decryptInboundMessageAndPushToChat() - ${JSON.stringify(msg)}`)
    await decryptInboundMessageAndPushToChat(msg)
  }
}

/**
 * Decrypts an incoming message and stores it.
 * @param msg The inbound message data.
 */
export function decryptInboundMessageAndPushToChat(msg: InboundMessage): Promise<void> {
  return enqueueDirectMessageOperation(() => decryptInboundMessageAndPushToChatInternal(msg))
}

async function decryptInboundMessageAndPushToChatInternal(msg: InboundMessage): Promise<void> {
  const userStore = useUserStore()
  const deviceStore = useDeviceStore()
  const chatStore = useChatsStore()

  if (!userStore.principal || !deviceStore.deviceId) {
    console.log('decryptInboundMessageAndPushToChat() - No principal/local device setup!')
    return
  }

  if (!chatStore.isHydrated) {
    await chatStore.hydrate()
  }

  const content = await getDirectMessageReceivingService().receive(msg)
  if (content === null) {
    console.warn(
      `decryptInboundMessageAndPushToChat() - No Sesame session could decrypt message=${msg.messageId}`,
    )
    return
  }

  const encodedMessage: unknown = JSON.parse(new TextDecoder().decode(content))

  console.log(
    `decryptInboundMessageAndPushToChat() - Decrypted message: ${JSON.stringify(encodedMessage)}`,
  )

  if (isTextMessage(encodedMessage)) {
    const actualChatUserId =
      msg.senderId === userStore.principal.id ? encodedMessage.ultimateReceiverId : msg.senderId

    let chat: Chat | null
    try {
      chat = await getExistingOrCreateNewChat(actualChatUserId)
    } catch (error) {
      console.error(
        `decryptInboundMessageAndPushToChat() - Failed to get/create chat for actualCounterpartyUserId=${actualChatUserId}:`,
        error,
      )
      return
    }

    if (!chat) {
      console.error(
        `decryptInboundMessageAndPushToChat() - No chat found/created for actualCounterpartyUserId=${actualChatUserId}`,
      )
      return
    }

    const createdAt = parseUtcTimestamp(msg.createdAt)

    const newStoredMessage: StoredMessage = {
      id: msg.messageId,
      chatId: chat.id,
      senderId: msg.senderId,
      recipientId:
        msg.senderId === userStore.principal.id ? actualChatUserId : userStore.principal.id,
      createdAt,
      content: encodedMessage.content,
      deliveredAt: null,
      readAt: actualChatUserId === userStore.principal.id ? createdAt : null,
    }

    await chatStore.addMessageToChat(chat, newStoredMessage)
  } else if (isReadReceiptMessage(encodedMessage)) {
    if (
      msg.senderId === userStore.principal.id ||
      encodedMessage.ultimateReceiverId !== userStore.principal.id
    ) {
      return
    }

    const chat = chatStore.chats.find((candidate) => candidate.contact.userId === msg.senderId)
    if (
      !chat ||
      chat.contact.userId === userStore.principal.id ||
      !(await areReadReceiptsEnabled(chat))
    ) {
      return
    }

    await chatStore.applyReadReceipts(chat, encodedMessage.receipts)
  } else if (isNoOpMessage(encodedMessage)) {
    return
  } else {
    console.warn('decryptInboundMessageAndPushToChat() - Unknown or malformed message type')
  }
}

function isTextMessage(message: unknown): message is TextMessage {
  if (!message || typeof message !== 'object') return false
  const candidate = message as Partial<TextMessage>
  return (
    candidate.type === 'TEXT' &&
    typeof candidate.ultimateReceiverId === 'string' &&
    typeof candidate.content === 'string'
  )
}

function isReadReceiptMessage(message: unknown): message is ReadReceiptMessage {
  if (!message || typeof message !== 'object') return false
  const candidate = message as Partial<ReadReceiptMessage>
  return (
    candidate.type === 'READ_RECEIPT' &&
    typeof candidate.ultimateReceiverId === 'string' &&
    Array.isArray(candidate.receipts) &&
    candidate.receipts.length > 0 &&
    candidate.receipts.length <= MAX_READ_RECEIPTS_PER_MESSAGE &&
    candidate.receipts.every(
      (receipt) =>
        receipt !== null &&
        typeof receipt === 'object' &&
        typeof receipt.messageId === 'string' &&
        UUID_PATTERN.test(receipt.messageId) &&
        typeof receipt.readAt === 'number' &&
        Number.isFinite(receipt.readAt) &&
        receipt.readAt > 0,
    )
  )
}

function isNoOpMessage(message: unknown): message is NoOpMessage {
  if (!message || typeof message !== 'object') return false
  const candidate = message as Partial<NoOpMessage>
  return candidate.type === 'NO_OP' && typeof candidate.ultimateReceiverId === 'string'
}

async function getExistingOrCreateNewChat(userId: string): Promise<Chat | null> {
  const userStore = useUserStore()
  const deviceStore = useDeviceStore()
  const contactStore = useContactsStore()
  const chatStore = useChatsStore()

  if (!userStore.principal || !deviceStore.deviceId) {
    throw new Error('No principal/local device setup!')
  }

  if (userId === userStore.principal.id) {
    return getOrCreateSavedMessagesChat()
  }

  const existingContact = contactStore.contacts.find((v) => v.userId === userId)
  let chat = chatStore.chats.find((chat) => chat.contact.userId === userId)
  if (!existingContact || !chat) {
    if (!existingContact && !chat) {
      console.log(
        `getExistingOrCreateNewChat() - No contact & chat state found for userId=${userId}. Creating...`,
      )
      await createContactAndChatForUserId(userId)
      chat = chatStore.chats.find((chat) => chat.contact.userId === userId)
      return chat!
    } else if (!chat && existingContact) {
      console.log(`getExistingOrCreateNewChat() - No chat found for userId=${userId}. Creating...`)
      chatStore.createNewChatFromContact(existingContact)
      chat = chatStore.chats.find((chat) => chat.contact.userId === userId)
      return chat!
    } else {
      throw new Error(`No contact found but chat state exists for userId=${userId}.`)
    }
  }

  if (!chat) {
    throw new Error(`Could not create/find chat for userId=${userId}.`)
  }

  return chat
}

async function createContactAndChatForUserId(userId: string) {
  const foundUser: FoundUser = (await contactApi.getUserByUserId(userId)).data

  const newContact = {
    userId: foundUser.id,
    username: foundUser.username,
  }
  const contactsStore = useContactsStore()
  contactsStore.addNewContact(newContact)

  const chatStore = useChatsStore()
  chatStore.createNewChatFromContact(newContact)
}
