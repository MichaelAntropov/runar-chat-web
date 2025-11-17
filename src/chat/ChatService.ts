import { useChatsStore } from './ChatStorage'
import { useDeviceStore } from '../device/DeviceStorage'
import type { InitKeyBundle } from './interfaces/key-bundle/InitKeyBundleResponse'
import { useUserStore } from '@/user/UserStorage'
import type { Chat } from '@/chat/interfaces/chat/Chat'
import type { DeviceMessagePayload, MessagePayload } from './interfaces/message/MessagePayload'
import type { SendMessageResponse } from '@/chat/interfaces/message/SendMessageResponse'
import type { StoredMessage } from '@/chat/interfaces/chat/StoredMessage'
import type { OfflineMessagesResponses } from './interfaces/message/MessagesResponse'
import type { OfflineMessage } from './interfaces/message/OfflineMessage'
import type { OneTimePreKeyState } from '@/device/interfaces/OneTimePreKeyState'
import type { IdentityKey } from './interfaces/identity-key/IdentityKey'
import { useContactsStore } from '@/contacts/ContactsStorage'
import type { InboundMessage } from './interfaces/message/InboundMessage'
import type { ChatState } from './interfaces/chat/ChatState'
import type { RatchetEncryptResult } from './crypto/types/RatchetEncryptResult'
import { base64ToUint8Array, uint8ArrayToBase64 } from '@/core/utils'
import {
  establishSecretKeyWithSender,
  generateSecretKeyForKeyBundle,
  verifyPreKeySignature,
} from './crypto/dhke'
import {
  initRatchetAsReceiver,
  initRatchetAsSender,
  ratchetDecrypt,
  ratchetEncrypt,
} from './crypto/ratchet'
import { chatStateRepository } from '@/db/repositories/ChatStateRepository'
import { preKeyRepository } from '@/db/repositories/PreKeyRepository'
import { chatApi } from './api/chatApi'

/**
 * Encrypts and sends a message to the user in the currently selected chat.
 * @param content The string content to send.
 */
export async function sendMessageInCurrentChat(content: string) {
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

  let existingChatStates: ChatState[] = await getEstablishedChatStatesForChat(chat)
  if (existingChatStates.length === 0) {
    console.log('sendMessageInCurrentChat() - No existing chat states. Establishing new session...')
    await establishChatStateForChat(chat)
    existingChatStates = await getEstablishedChatStatesForChat(chat)
  }

  console.log('sendMessageInCurrentChat() - Chat states fetched!')

  const senderIdEncoded = new TextEncoder().encode(userStore.principal.id)
  const receiverIdEncoded = new TextEncoder().encode(chat.contact.userId)

  const associatedData = new Uint8Array(senderIdEncoded.length + receiverIdEncoded.length)
  associatedData.set(senderIdEncoded)
  associatedData.set(receiverIdEncoded, senderIdEncoded.length)

  const messagePayloads: DeviceMessagePayload[] = await Promise.all(
    existingChatStates.map(async (chatState: ChatState) => {
      console.log(
        `sendMessageInCurrentChat() - Encrypt message for user=${chatState.userId} with device=${chatState.deviceId}`,
      )

      const encryptResult: RatchetEncryptResult = await ratchetEncrypt(
        chatState,
        new TextEncoder().encode(content),
        associatedData,
      )
      await chatStateRepository.updateChatState(chatState)

      return {
        receiverDeviceId: chatState.deviceId,
        receiverPreKeyId: chatState.deviceId,
        receiverOneTimePreKeyId: chatState.preKeyIdUsed,
        senderEphemeralKey: chatState.ephemeralPublicBytes
          ? uint8ArrayToBase64(chatState.ephemeralPublicBytes)
          : null,
        cipherPayload: uint8ArrayToBase64(encryptResult.encryptedPayload),
        encryptedHeader: uint8ArrayToBase64(encryptResult.header),
      }
    }),
  )

  const messagePayload: MessagePayload = {
    senderDeviceId: deviceStore.deviceId,
    deviceMessages: messagePayloads,
  }

  const response: SendMessageResponse = (await chatApi.postSendMessagePayload(messagePayload)).data
  console.log(`sendMessageInCurrentChat() - Send message response: `, response)

  const newStoredMessage: StoredMessage = {
    id: response.messageId,
    chatId: chat.id,
    senderId: userStore.principal.id,
    recipientId: chat.contact.userId,
    createdAt: Date.parse(response.createdAt),
    content: content,
  }

  chatStore.addMessageToChat(chat, newStoredMessage)
}

/**
 * Fetches all offline messages from the server, decrypts them, and adds them to their respective chats.
 */
export async function fetchAndDecryptOfflineMessages() {
  const deviceStore = useDeviceStore()
  if (!deviceStore.deviceId) {
    console.log('fetchAndDecryptOfflineMessages() - No device setup!')
    return
  }

  console.log('fetchAndDecryptOfflineMessages() - Fetching and decrypting offline messages...')

  const offlineMessages = await fetchOfflineMessages(deviceStore.deviceId)
  offlineMessages.sort((msgA, msgB) => Date.parse(msgA.createdAt) - Date.parse(msgB.createdAt))

  for (const msg of offlineMessages) {
    console.log(`decryptInboundMessageAndPushToChat() - ${JSON.stringify(msg)}`)
    await decryptInboundMessageAndPushToChat(msg)
  }
}

/**
 * Decrypts an incoming message and stores it.
 * @param msg The inbound message data.
 */
export async function decryptInboundMessageAndPushToChat(msg: InboundMessage) {
  const userStore = useUserStore()
  const deviceStore = useDeviceStore()
  const chatStore = useChatsStore()
  const contactStore = useContactsStore()

  if (!userStore.principal || !deviceStore.deviceId) {
    console.log('decryptInboundMessageAndPushToChat() - No principal/device setup!')
    return
  }

  const existingContact = contactStore.contacts.find((v) => v.userId === msg.senderId)
  const chat = chatStore.chats.find((chat) => chat.contact.userId === msg.senderId)
  if (!existingContact || !chat) {
    console.warn('decryptInboundMessageAndPushToChat() - No existing contact/chat!')
    return
  }

  let chatState: ChatState | undefined = await getEstablishedChatStateForDeviceId(
    msg.senderDeviceId,
  )

  if (!msg.encryptedHeader) {
    console.error(
      `decryptInboundMessageAndPushToChat() - No encryptedHeader in message from ${msg.senderId} and deviceId=${msg.senderDeviceId}!`,
    )
    return
  }

  if (!chatState) {
    if (!msg.senderEphemeralKey) {
      console.error(
        `decryptInboundMessageAndPushToChat() - Cannot establish session with ${msg.senderId} and deviceId=${msg.senderDeviceId}: senderEphemeralKey is missing.`,
      )
      return
    }
    console.log(
      `decryptInboundMessageAndPushToChat() - No existing ChatState with ${msg.senderId} and device ${msg.senderDeviceId}. Establishing new session...`,
    )

    let oneTimePreKey: OneTimePreKeyState | undefined
    if (msg.oneTimePreKeyIdUsed) {
      oneTimePreKey = await preKeyRepository.getPreKeyById(msg.oneTimePreKeyIdUsed)
      await preKeyRepository.deletePreKeyById(msg.oneTimePreKeyIdUsed)
      if (!oneTimePreKey) throw new Error('One Time Pre Key Used but not found!')
    }

    const senderIdentityKeys: IdentityKey[] = await chatApi.getIdentityKeys(msg.senderId)
    const senderDeviceIdentityKey: IdentityKey | undefined = senderIdentityKeys.find(
      (key) => key.deviceId === msg.senderDeviceId,
    )
    if (!senderDeviceIdentityKey || !senderDeviceIdentityKey.x25519PublicKey) {
      throw new Error(`Could not find identity key for sender device ${msg.senderDeviceId}`)
    }

    const receiverIdentity = deviceStore.identityX25519
    const receiverSignedPreKey = deviceStore.preKey
    if (!receiverIdentity.keyPair || !receiverSignedPreKey.keyPair) {
      throw new Error('Local device keys are not initialized.')
    }

    const secretKey: CryptoKey = await establishSecretKeyWithSender(
      senderDeviceIdentityKey,
      msg.senderEphemeralKey,
      receiverIdentity,
      receiverSignedPreKey,
      oneTimePreKey!, // Pass even if undefined
    )

    console.log(
      `Calculated SK: ${uint8ArrayToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', secretKey)))}`,
    )

    console.log(
      `Pre key public: ${uint8ArrayToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', receiverSignedPreKey.keyPair.publicKey)))}`,
    )

    console.log(
      `DH receiving public key: ${uint8ArrayToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', receiverSignedPreKey.keyPair.publicKey)))}`,
    )

    chatState = createNewChatState(
      msg.senderId,
      senderDeviceIdentityKey.deviceId,
      senderDeviceIdentityKey.x25519PublicKey,
    )

    const secretKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', secretKey))
    await initRatchetAsReceiver(
      chatState,
      secretKeyRaw,
      receiverSignedPreKey.keyPair.privateKey,
      receiverSignedPreKey.keyPair.publicKey,
    )
    await chatStateRepository.saveChatState(chatState)
    console.log(`ChatState for device=${msg.senderDeviceId} established!`)
  }

  const senderIdEncoded = new TextEncoder().encode(msg.senderId)
  const receiverIdEncoded = new TextEncoder().encode(userStore.principal.id)

  const ad = new Uint8Array(senderIdEncoded.length + receiverIdEncoded.length)
  ad.set(senderIdEncoded)
  ad.set(receiverIdEncoded, senderIdEncoded.length)

  const content: Uint8Array = await ratchetDecrypt(
    chatState,
    msg.encryptedHeader,
    msg.cipherPayload,
    ad,
  )
  await chatStateRepository.updateChatState(chatState)

  console.log(`decryptInboundMessageAndPushToChat() - Decrypted message: ${content}`)

  const newStoredMessage: StoredMessage = {
    id: msg.messageId,
    chatId: chat.id,
    senderId: msg.senderId,
    recipientId: userStore.principal.id,
    createdAt: Date.parse(msg.createdAt),
    content: new TextDecoder().decode(content),
  }

  chatStore.addMessageToChat(chat, newStoredMessage)
}

async function fetchOfflineMessages(deviceId: string): Promise<Array<OfflineMessage>> {
  const userStore = useUserStore()
  const response = await fetch(`/api/v1/messages/receive/${deviceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (await userStore.getAccessToken()),
    },
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('getKeyBundle() - error body:', errorBody)
    throw new Error(`getKeyBundle() error! Status: ${response.status}`)
  }

  const result: OfflineMessagesResponses = await response.json()

  const parsedResult: Array<OfflineMessage> = []
  for (let i = 0; i < result.messages.length; i++) {
    const msg = result.messages[i]
    const offlineMessage: OfflineMessage = {
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
    }

    parsedResult.push(offlineMessage)
  }

  return parsedResult
}

async function getEstablishedChatStateForDeviceId(
  deviceId: string,
): Promise<ChatState | undefined> {
  console.log('Get existing ChatState for device...')
  return chatStateRepository.getFirstChatStateByDeviceId(deviceId)
}

async function getEstablishedChatStatesForChat(chat: Chat): Promise<ChatState[]> {
  console.log('Get existing chat states...')
  return chatStateRepository.getAllChatStatesByUserId(chat.contact.userId)
}

async function establishChatStateForChat(chat: Chat) {
  const deviceStore = useDeviceStore()
  console.log(`Fetching key bundles for ${chat.contact.username}...`)
  const keyBundles: InitKeyBundle = await chatApi.getKeyBundle(chat.contact.userId)

  const verifications: boolean[] = await Promise.all(
    keyBundles.keyBundles.map((bundle) => {
      console.log(`Verify signature for device=${bundle.deviceId}`)
      return verifyPreKeySignature(bundle.ed25519identityKey, bundle.preKey, bundle.preKeySignature)
    }),
  )
  if (verifications.some((v: boolean) => !v)) {
    throw new Error('Failed to verify one or more device pre-key signatures.')
  }

  if (!deviceStore.identityX25519.keyPair) {
    throw new Error('Local identity key missing.')
  }

  const identityX25519PrivateKey: CryptoKey = deviceStore.identityX25519.keyPair.privateKey

  const generatedSkBundles = await Promise.all(
    keyBundles.keyBundles.map((bundle) =>
      generateSecretKeyForKeyBundle(bundle, identityX25519PrivateKey),
    ),
  )

  for (const skBundle of generatedSkBundles) {
    const newChatState = createNewChatState(chat.contact.userId, skBundle.deviceId, null)
    newChatState.preKeyIdUsed = skBundle.oneTimePreKeyId
    newChatState.ephemeralPublicBytes = skBundle.ephemeralPublicBytes

    const secretKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', skBundle.secretKey))
    await initRatchetAsSender(newChatState, secretKeyRaw, skBundle.preKeyPublic)
    await chatStateRepository.saveChatState(newChatState)
  }
}

function createNewChatState(
  userId: string,
  deviceId: string,
  x25519publicIdentityKey: Uint8Array<ArrayBuffer> | null,
): ChatState {
  return {
    deviceId: deviceId,
    userId: userId,
    x25519publicIdentityKey: x25519publicIdentityKey,
    dhSendingKeyPair: null,
    dhReceivingPublicKey: null,
    rootKey: null,
    chainKeySending: null,
    chainKeyReceiving: null,
    skippedMessageKeys: new Map(),
    sendingMessageNumber: 0,
    receivingMessageNumber: 0,
    previousChainLength: 0,
    preKeyIdUsed: null,
    ephemeralPublicBytes: null,
  }
}
