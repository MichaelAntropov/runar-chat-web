import { useChatsStore } from './chatStore'
import { useDeviceStore } from '../device/deviceStore'
import type { InitDeviceKeyBundle, InitKeyBundle } from './types/key-bundle/InitKeyBundleResponse'
import { sessionsApi } from '@/auth/api/sessionsApi'
import { useUserStore } from '@/user/userStore'
import type { Chat } from '@/chat/types/chat/Chat'
import type { DeviceMessagePayload, MessagePayload } from './types/message/MessagePayload'
import type { SendMessageResponse } from '@/chat/types/message/SendMessageResponse'
import type { StoredMessage } from '@/chat/types/chat/StoredMessage'
import type { OneTimePreKeyState } from '@/device/types/OneTimePreKeyState'
import type { IdentityKey } from './types/identity-key/IdentityKey'
import { useContactsStore } from '@/contacts/contactStore'
import type { InboundMessage } from './types/message/InboundMessage'
import type { ChatState } from './types/chat/ChatState'
import type { RatchetEncryptResult } from './crypto/types/RatchetEncryptResult'
import { parseUtcTimestamp, uint8ArrayToBase64 } from '@/core/utils'
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
import { contactApi } from '@/contacts/contactApi'
import type { FoundUser } from '@/contacts/types/FindUserResponse'
import type { SkippedMessageKey } from './crypto/types/SkippedMessage'
import type { InitialRatchetKeys } from './crypto/types/InitialRatchetKeys'
import { MissingDevicesError } from './types/message/MissingDevicesError'
import type { GeneratedSecretKeyBundle } from './crypto/types/GeneratedSecretKeyBundle'
import type { EncodedMessage } from './types/chat/Message'
import type { TextMessage } from './types/chat/TextMessage'

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
export async function sendMessageInCurrentChat(content: string, retryCount = 0) {
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

  if (chat.contact.userId === userStore.principal.id && existingChatStates.length === 0) {
    const createdAt = Date.now()
    const localMessage: StoredMessage = {
      id: crypto.randomUUID(),
      chatId: chat.id,
      senderId: userStore.principal.id,
      recipientId: userStore.principal.id,
      createdAt,
      content,
      readAt: createdAt,
    }
    await chatStore.addMessageToChat(chat, localMessage)
    return
  }

  console.log('sendMessageInCurrentChat() - Chat states fetched!')

  const senderIdEncoded = new TextEncoder().encode(userStore.principal.id)

  const messagePayloads: DeviceMessagePayload[] = await Promise.all(
    existingChatStates.map(async (chatState: ChatState) => {
      console.log(
        `sendMessageInCurrentChat() - Encrypt message for user=${chatState.userId} with device=${chatState.deviceId}`,
      )

      const receiverIdEncoded = new TextEncoder().encode(chatState.userId)

      const associatedData = new Uint8Array(senderIdEncoded.length + receiverIdEncoded.length)
      associatedData.set(senderIdEncoded)
      associatedData.set(receiverIdEncoded, senderIdEncoded.length)

      const textMessage: TextMessage = {
        type: 'TEXT',
        ultimateReceiverId: chat.contact.userId,
        content: content,
      }

      const encryptResult: RatchetEncryptResult = await ratchetEncrypt(
        chatState,
        new TextEncoder().encode(JSON.stringify(textMessage)),
        associatedData,
      )

      return {
        receiverUserId: chatState.userId,
        receiverDeviceId: chatState.deviceId,
        receiverPreKeyId: chatState.deviceId,
        receiverOneTimePreKeyId: chatState.preKeyIdUsed,
        senderEphemeralKey: chatState.ephemeralPublicBytes
          ? uint8ArrayToBase64(chatState.ephemeralPublicBytes)
          : null,
        cipherPayload: uint8ArrayToBase64(encryptResult.encryptedPayload),
        encryptedHeader: uint8ArrayToBase64(encryptResult.encryptedHeader),
      }
    }),
  )

  const messagePayload: MessagePayload = {
    deviceMessages: messagePayloads,
  }

  try {
    const response: SendMessageResponse = await chatApi.postSendMessagePayload(messagePayload)

    console.log(`sendMessageInCurrentChat() - Send message response: `, response)

    const newStoredMessage: StoredMessage = {
      id: response.messageId,
      chatId: chat.id,
      senderId: userStore.principal.id,
      recipientId: chat.contact.userId,
      createdAt: parseUtcTimestamp(response.createdAt),
      content: content,
      readAt: null,
    }

    for (const chatState of existingChatStates) {
      await chatStateRepository.updateChatState(chatState)
    }
    await chatStore.addMessageToChat(chat, newStoredMessage)
  } catch (error) {
    if (error instanceof MissingDevicesError) {
      console.warn('sendMessageInCurrentChat() - Missing Devices:', error.deviceIds)

      if (retryCount >= 2) {
        console.error(`sendMessageInCurrentChat() - Aborting after 2 retries for missing devices.`)
        throw error
      }

      let count = 0
      const keyBundles: Map<string, InitDeviceKeyBundle[]> = await chatApi.getKeyBundles(
        error.deviceIds,
      )
      for (const [userId, bundles] of keyBundles.entries()) {
        for (const bundle of bundles) {
          await establishChatStateForKeyBundle(userId, bundle)
          count++
        }
      }

      if (count === 0) {
        console.error(
          'sendMessageInCurrentChat() - API reported missing devices, but no key bundles were returned.',
        )
        throw error
      }

      console.log(
        `sendMessageInCurrentChat() - Recovered ${count} sessions. Retrying... (Attempt ${retryCount + 1})`,
      )

      console.log(
        'sendMessageInCurrentChat() - Retrying to send message after establishing keys...',
      )
      await sendMessageInCurrentChat(content, retryCount + 1)
    } else {
      console.error('sendMessageInCurrentChat() - Failed to send', error)
      throw error
    }
  }
}

/**
 * Fetches all offline messages from the server, decrypts them, and adds them to their respective chats.
 */
export async function fetchAndDecryptOfflineMessages() {
  const deviceStore = useDeviceStore()
  if (!deviceStore.deviceId) {
    console.warn('fetchAndDecryptOfflineMessages() - No device setup!')
    return
  }

  console.log('fetchAndDecryptOfflineMessages() - Fetching and decrypting offline messages...')

  const offlineMessages = await chatApi.postReceiveOfflineMessages()
  offlineMessages.sort(
    (msgA, msgB) => parseUtcTimestamp(msgA.createdAt) - parseUtcTimestamp(msgB.createdAt),
  )

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

  if (!userStore.principal || !deviceStore.deviceId) {
    console.log('decryptInboundMessageAndPushToChat() - No principal/local device setup!')
    return
  }

  if (msg.senderId !== userStore.principal.id) {
    try {
      await getExistingOrCreateNewChat(msg.senderId)
    } catch (error) {
      console.error(
        `decryptInboundMessageAndPushToChat() - Failed to get/create chat for userId=${msg.senderId}:`,
        error,
      )
      return
    }
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

    const initialKeys: InitialRatchetKeys = await establishSecretKeyWithSender(
      senderDeviceIdentityKey,
      msg.senderEphemeralKey,
      receiverIdentity,
      receiverSignedPreKey,
      oneTimePreKey!, // Pass even if undefined
    )

    console.log(
      `Calculated SK: ${uint8ArrayToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', initialKeys.rootKey)))}`,
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

    const secretKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', initialKeys.rootKey))
    await initRatchetAsReceiver(
      chatState,
      secretKeyRaw,
      receiverSignedPreKey.keyPair.privateKey,
      receiverSignedPreKey.keyPair.publicKey,
      initialKeys.sharedHeaderKey,
      initialKeys.sharedNextHeaderKey,
    )
    await chatStateRepository.saveChatState(chatState)
    console.log(`ChatState for device=${msg.senderDeviceId} established!`)
  }

  const senderIdEncoded = new TextEncoder().encode(msg.senderId)
  const receiverIdEncoded = new TextEncoder().encode(userStore.principal.id)

  const associatedData = new Uint8Array(senderIdEncoded.length + receiverIdEncoded.length)
  associatedData.set(senderIdEncoded)
  associatedData.set(receiverIdEncoded, senderIdEncoded.length)

  const content: Uint8Array = await ratchetDecrypt(
    chatState,
    msg.encryptedHeader,
    msg.cipherPayload,
    associatedData,
  )

  const encodedMessage: EncodedMessage = JSON.parse(
    new TextDecoder().decode(content),
  ) as EncodedMessage

  console.log(
    `decryptInboundMessageAndPushToChat() - Decrypted message: ${JSON.stringify(encodedMessage)}`,
  )

  if (encodedMessage.type === 'TEXT') {
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

    const textMessage: TextMessage = encodedMessage as TextMessage
    const createdAt = parseUtcTimestamp(msg.createdAt)

    const newStoredMessage: StoredMessage = {
      id: msg.messageId,
      chatId: chat.id,
      senderId: msg.senderId,
      recipientId:
        msg.senderId === userStore.principal.id
          ? actualChatUserId
          : userStore.principal.id,
      createdAt,
      content: textMessage.content,
      readAt: actualChatUserId === userStore.principal.id ? createdAt : null,
    }

    await chatStateRepository.updateChatState(chatState)
    await chatStore.addMessageToChat(chat, newStoredMessage)
  } else {
    console.warn(
      `decryptInboundMessageAndPushToChat() - Unknown message type: ${encodedMessage.type}`,
    )
  }
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

async function getEstablishedChatStateForDeviceId(
  deviceId: string,
): Promise<ChatState | undefined> {
  console.log('Get existing ChatState for device...')
  return chatStateRepository.getFirstChatStateByDeviceId(deviceId)
}

async function getEstablishedChatStatesForChat(chat: Chat): Promise<ChatState[]> {
  console.log('Get existing chat states...')
  const deviceStore = useDeviceStore()
  const userStore = useUserStore()
  const chatStatesWithContact: ChatState[] = await chatStateRepository.getAllChatStatesByUserId(
    chat.contact.userId,
  )
  const chatStatesWithOtherPrincipleDevices: ChatState[] =
    await chatStateRepository.getAllChatStatesByUserId(userStore.principal!.id)

  const statesByDeviceId = new Map<string, ChatState>()
  for (const chatState of chatStatesWithContact.concat(chatStatesWithOtherPrincipleDevices)) {
    if (chatState.deviceId !== deviceStore.deviceId) {
      statesByDeviceId.set(chatState.deviceId, chatState)
    }
  }

  return [...statesByDeviceId.values()]
}

async function establishChatStateForChat(chat: Chat) {
  const deviceStore = useDeviceStore()
  const userStore = useUserStore()
  console.log(`Fetching key bundles for ${chat.contact.username}...`)
  let keyBundles: InitKeyBundle

  if (chat.contact.userId === userStore.principal?.id) {
    const sessions = await sessionsApi.getDeviceSessions()
    const otherDeviceIds = sessions.deviceSessions
      .map((session) => session.deviceId)
      .filter((deviceId) => deviceId !== deviceStore.deviceId)

    if (otherDeviceIds.length === 0) return

    const bundlesByUser = await chatApi.getKeyBundles({
      [chat.contact.userId]: otherDeviceIds,
    })
    keyBundles = { keyBundles: bundlesByUser.get(chat.contact.userId) ?? [] }
  } else {
    keyBundles = await chatApi.getKeyBundle(chat.contact.userId)
  }

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
    await initRatchetAsSender(
      newChatState,
      secretKeyRaw,
      skBundle.preKeyPublic,
      skBundle.sharedHeaderKey,
      skBundle.sharedNextHeaderKey,
    )
    await chatStateRepository.saveChatState(newChatState)
  }
}

async function establishChatStateForKeyBundle(userId: string, bundle: InitDeviceKeyBundle) {
  const deviceStore = useDeviceStore()

  console.log(`Verify signature for device=${bundle.deviceId}`)
  const verification: boolean = await verifyPreKeySignature(
    bundle.ed25519identityKey,
    bundle.preKey,
    bundle.preKeySignature,
  )

  if (!verification) {
    throw new Error('Failed to verify device pre-key signatures.')
  }

  if (!deviceStore.identityX25519.keyPair) {
    throw new Error('Local identity key missing.')
  }

  const identityX25519PrivateKey: CryptoKey = deviceStore.identityX25519.keyPair.privateKey

  const skBundle: GeneratedSecretKeyBundle = await generateSecretKeyForKeyBundle(
    bundle,
    identityX25519PrivateKey,
  )

  const newChatState = createNewChatState(userId, skBundle.deviceId, null)
  newChatState.preKeyIdUsed = skBundle.oneTimePreKeyId
  newChatState.ephemeralPublicBytes = skBundle.ephemeralPublicBytes

  const secretKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', skBundle.secretKey))
  await initRatchetAsSender(
    newChatState,
    secretKeyRaw,
    skBundle.preKeyPublic,
    skBundle.sharedHeaderKey,
    skBundle.sharedNextHeaderKey,
  )
  await chatStateRepository.saveChatState(newChatState)
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
    skippedMessageKeys: new Array<SkippedMessageKey>(),
    sendingMessageNumber: 0,
    receivingMessageNumber: 0,
    previousChainLength: 0,
    preKeyIdUsed: null,
    ephemeralPublicBytes: null,
    headerKeySending: null,
    headerKeyNextSending: null,
    headerKeyReceiving: null,
    headerKeyNextReceiving: null,
  }
}
