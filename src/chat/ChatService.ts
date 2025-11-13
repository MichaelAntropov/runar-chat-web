import { defineStore } from 'pinia'
import { useChatsStore } from './ChatStorage'
import { useDeviceStore } from '../device/DeviceStorage'
import type {
  InitDeviceKeyBundle,
  InitDeviceKeyBundleResponse,
  InitKeyBundle,
  InitKeyBundleResponse,
} from './interfaces/key-bundle/InitKeyBundleResponse'
import { useUserStore } from '@/user/UserStorage'
import type { Chat } from '@/chat/interfaces/chat/Chat'
import type { GeneratedSecretKeyBundle } from './interfaces/key-bundle/GeneratedSecretKeyBundle'
import type { DeviceMessagePayload, MessagePayload } from './interfaces/message/MessagePayload'
import type { SendMessageResponse } from '@/chat/interfaces/message/SendMessageResponse'
import type { StoredMessage } from '@/chat/interfaces/chat/StoredMessage'
import type { OfflineMessagesResponses } from './interfaces/message/MessagesResponse'
import type { OfflineMessage } from './interfaces/message/OfflineMessage'
import type { OneTimePreKeyState } from '@/device/interfaces/OneTimePreKeyState'
import type {
  IdentityKeyResponse,
  IdentityKeysResponse,
} from './interfaces/identity-key/IdentityKeysResponse'
import type { IdentityKey } from './interfaces/identity-key/IdentityKey'
import { useContactsStore } from '@/contacts/ContactsStorage'
import type { InboundMessage } from './interfaces/message/InboundMessage'
import type { ChatState } from './interfaces/chat/ChatState'
import type { RatchetEncryptResult } from './crypto/types/RatchetEncryptResult'
import { base64ToUint8Array, uint8ArrayToBase64 } from '@/core/utils'
import {
  calculateDH,
  verifyPreKeySignature,
  x25519PublicCryptoKeyForDHFromPublicBytes,
} from './crypto/dhke'
import {
  initRatchetAsReceiver,
  initRatchetAsSender,
  ratchetDecrypt,
  ratchetEncrypt,
} from './crypto/ratchet'
import { chatStateRepository } from '@/db/repositories/ChatStateRepository'
import { messageRepository } from '@/db/repositories/MessageRepository'
import { preKeyRepository } from '@/db/repositories/PreKeyRepository'

const APPLICATION_INFO_STRING = 'QuarkusChatSecure'

export const useChatService = defineStore('chat-service', () => {
  const userStore = useUserStore()
  const chatStore = useChatsStore()
  const deviceStore = useDeviceStore()
  const contactStore = useContactsStore()

  /**
   * Encrypts and sends message to user in currently selected chat
   * @param content string to send
   * @returns
   */
  async function sendMessageInCurrentChat(content: string) {
    if (!userStore.principal || !deviceStore.deviceId) {
      console.log('sendMessageInCurrentChat() - No principal/device setup!')
      return
    }

    if (!chatStore.currentChat) {
      console.log('sendMessageInCurrentChat() - No current chat selected!')
      return
    }

    const chat: Chat = chatStore.currentChat
    console.log(`Send message in current chat(${chat.id}) to ${chat.contact.username}`)

    let existingChatStates: ChatState[] = await getEstablishedChatStatesForChat(chat)
    if (!existingChatStates || existingChatStates.length === 0) {
      console.log('No existing chat states. Init chat states...')
      await establishChatStateForChat(chat)
      existingChatStates = await getEstablishedChatStatesForChat(chat)
    }

    console.log('Chat states fetched!')

    const senderIdEncoded: Uint8Array = new TextEncoder().encode(userStore.principal.id)
    const receiverIdEncoded: Uint8Array = new TextEncoder().encode(chat.contact.userId)

    const associatedData = new Uint8Array(senderIdEncoded.length + receiverIdEncoded.length)
    associatedData.set(senderIdEncoded)
    associatedData.set(receiverIdEncoded, senderIdEncoded.length)

    const senderId: string = userStore.principal.id
    const senderDeviceId: string = deviceStore.deviceId

    const messagePayloads: DeviceMessagePayload[] = await Promise.all(
      existingChatStates.map(async (chatState: ChatState) => {
        console.log(
          `Encrypt message for user=${chatState.userId} with device=${chatState.deviceId}`,
        )

        const encryptResult: RatchetEncryptResult = await ratchetEncrypt(
          chatState,
          new TextEncoder().encode(content),
          associatedData,
        )

        await chatStateRepository.updateChatState(chatState)

        const deviceMessagePayload: DeviceMessagePayload = {
          receiverDeviceId: chatState.deviceId,
          receiverPreKeyId: chatState.deviceId,

          receiverOneTimePreKeyId: chatState.preKeyIdUsed,
          senderEphemeralKey: chatState.ephemeralPublicBytes
            ? uint8ArrayToBase64(chatState.ephemeralPublicBytes)
            : null,

          cipherPayload: uint8ArrayToBase64(encryptResult.encryptedPayload),
          encryptedHeader: uint8ArrayToBase64(encryptResult.header),
        }

        return deviceMessagePayload
      }),
    )

    const messagePayload: MessagePayload = {
      senderDeviceId: senderDeviceId,
      deviceMessages: messagePayloads,
    }

    const response: SendMessageResponse = await sendMessagePayload(messagePayload)
    console.log(`Send messages payload response: `)
    console.log(response)

    const newStoredMessage: StoredMessage = {
      id: response.messageId,
      chatId: chat.id,
      senderId: senderId,
      recipientId: chat.contact.userId,
      createdAt: Date.parse(response.createdAt),
      content: content,
    }

    await messageRepository.saveMessage(newStoredMessage)
  }

  /**
   * Method to fetch all messages that were sent to this device while offline
   * @returns
   */
  async function fetchAndDecryptOfflineMessages() {
    if (!userStore.principal || !deviceStore.deviceId) {
      console.log('fetchOfflineMessages() - No principal/device setup!')
      return
    }

    console.log('fetchAndDecryptOfflineMessages()')
    const offlineMessages: Array<OfflineMessage> = await fetchOfflineMessages(deviceStore.deviceId)

    offlineMessages.sort((msgA, msgB) => Date.parse(msgA.createdAt) - Date.parse(msgB.createdAt))

    for (let i = 0; i < offlineMessages.length; i++) {
      const msg: OfflineMessage = offlineMessages[i]
      console.log(`decryptInboundMessageAndPushToChat() - ${JSON.stringify(msg)}`)
      await decryptInboundMessageAndPushToChat(msg)
    }
  }

  async function fetchOfflineMessages(deviceId: string): Promise<Array<OfflineMessage>> {
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

  async function decryptInboundMessageAndPushToChat(msg: InboundMessage) {
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
        `decryptInboundMessageAndPushToChat() - No encryptedHeader in message from userId=${msg.senderId} with deviceId=${msg.senderDeviceId}!`,
      )
      return
    }

    if (!chatState && !msg.senderEphemeralKey) {
      console.error(
        `decryptInboundMessageAndPushToChat() - No existing ChatState for userId=${msg.senderId} with deviceId=${msg.senderDeviceId}. But no init msg data provided!`,
      )
      return
    }

    if (!chatState && msg.senderEphemeralKey) {
      console.log(
        `decryptInboundMessageAndPushToChat() - No existing ChatState for userId=${msg.senderId} with deviceId=${msg.senderDeviceId}. Establish ChatState...`,
      )
      await establishChatStateForDeviceId(
        msg.senderId,
        msg.senderDeviceId,
        msg.senderEphemeralKey,
        msg.oneTimePreKeyIdUsed,
      )
      chatState = await getEstablishedChatStateForDeviceId(msg.senderDeviceId)
    }

    if (!chatState) {
      console.error(
        `decryptInboundMessageAndPushToChat() - No existing ChatState for userId=${msg.senderId} with deviceId=${msg.senderDeviceId}`,
      )
      return
    }

    console.log(
      `decryptInboundMessageAndPushToChat() - ChatState for userId=${msg.senderId} with deviceId=${msg.senderDeviceId} fetched!`,
    )

    const senderIdEncoded: Uint8Array = new TextEncoder().encode(msg.senderId)
    const receiverIdEncoded: Uint8Array = new TextEncoder().encode(userStore.principal.id)

    const ad = new Uint8Array(senderIdEncoded.length + receiverIdEncoded.length)
    ad.set(senderIdEncoded)
    ad.set(receiverIdEncoded, senderIdEncoded.length)

    const content: Uint8Array<ArrayBuffer> = await ratchetDecrypt(
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

  async function establishChatStateForDeviceId(
    senderUserId: string,
    senderDeviceId: string,
    ephemeralKey: Uint8Array<ArrayBuffer>,
    preKeyIdUsed: string | null,
  ) {
    let oneTimePreKey: OneTimePreKeyState | undefined
    if (preKeyIdUsed) {
      oneTimePreKey = await preKeyRepository.getPreKeyById(preKeyIdUsed)
      await preKeyRepository.deletePreKeyById(preKeyIdUsed)
      if (!oneTimePreKey) throw new Error('One Time Pre Key Used but not found!')
    }

    const senderIdentityKeys: IdentityKey[] = await getIdentityKeys(senderUserId)
    const senderDeviceIdentityKey: IdentityKey | undefined = senderIdentityKeys.find(
      (v) => v.deviceId === senderDeviceId,
    )
    if (!senderDeviceIdentityKey) {
      throw new Error(`No identity key found for ${senderDeviceId}!`)
    }

    const identityKey = deviceStore.identityX25519.keyPair?.privateKey
    const preKeyPrivate = deviceStore.preKey.keyPair?.privateKey

    if (!identityKey || !preKeyPrivate || !senderDeviceIdentityKey.x25519PublicKey) {
      throw new Error('No identity key/pre key initialized!')
    }

    const identityKeySenderPublic: CryptoKey = await x25519PublicCryptoKeyForDHFromPublicBytes(
      senderDeviceIdentityKey.x25519PublicKey,
    )

    const ephemeralSenderPublic: CryptoKey =
      await x25519PublicCryptoKeyForDHFromPublicBytes(ephemeralKey)

    let dh1: Uint8Array | null = await calculateDH(preKeyPrivate, identityKeySenderPublic)
    let dh2: Uint8Array | null = await calculateDH(identityKey, ephemeralSenderPublic)
    let dh3: Uint8Array | null = await calculateDH(preKeyPrivate, ephemeralSenderPublic)
    let dh4: Uint8Array | null = null
    if (oneTimePreKey && oneTimePreKey.keyPair?.privateKey) {
      dh4 = await calculateDH(oneTimePreKey.keyPair.privateKey, ephemeralSenderPublic)
    }

    let keyMaterial = null
    if (dh4) {
      keyMaterial = new Uint8Array(dh1.length + dh2.length + dh3.length + dh2.length)
      keyMaterial.set(dh1)
      keyMaterial.set(dh2, dh1.length)
      keyMaterial.set(dh3, dh1.length + dh2.length)
      keyMaterial.set(dh4, dh1.length + dh2.length + dh3.length)
    } else {
      console.warn('One time pre key missing!')
      keyMaterial = new Uint8Array(dh1.length + dh2.length + dh3.length + dh2.length)
      keyMaterial.set(dh1)
      keyMaterial.set(dh2, dh1.length)
      keyMaterial.set(dh3, dh1.length + dh2.length)
    }

    let baseKey: CryptoKey | null = await window.crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'HKDF' },
      false,
      ['deriveKey'],
    )

    const secretKey = await window.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        salt: new Uint8Array(32).fill(0),
        info: new TextEncoder().encode(APPLICATION_INFO_STRING),
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    )

    dh1 = null
    dh2 = null
    dh3 = null
    dh4 = null
    keyMaterial = null
    baseKey = null

    const newChatState: ChatState = {
      deviceId: senderDeviceIdentityKey.deviceId,
      userId: senderUserId,

      x25519publicIdentityKey: senderDeviceIdentityKey.x25519PublicKey,

      dhSendingKeyPair: null,
      dhReceivingPublicKey: null,
      rootKey: null,

      chainKeySending: null,
      chainKeyReceiving: null,

      skippedMessageKeys: new Map<string, Uint8Array<ArrayBuffer>>(),

      sendingMessageNumber: 0,
      receivingMessageNumber: 0,
      previousChainLength: 0,

      preKeyIdUsed: null,
      ephemeralPublicBytes: null,
    }

    if (!deviceStore.preKey.keyPair) {
      throw new Error('No identity pre key initialized!')
    }

    console.log(
      `Calculated SK: ${uint8ArrayToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', secretKey)))}`,
    )

    console.log(
      `Pre key public: ${uint8ArrayToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', deviceStore.preKey.keyPair.publicKey)))}`,
    )

    console.log(
      `DH receiving public key: ${uint8ArrayToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', deviceStore.preKey.keyPair.publicKey)))}`,
    )

    await initRatchetAsReceiver(
      newChatState,
      new Uint8Array(await crypto.subtle.exportKey('raw', secretKey)),
      deviceStore.preKey.keyPair.privateKey,
      deviceStore.preKey.keyPair.publicKey,
    )
    await chatStateRepository.updateChatState(newChatState)
    console.log(`ChatState for device=${senderDeviceId} generated!`)
  }

  async function establishChatStateForChat(chat: Chat) {
    console.log('Get key bundles...')
    const keyBundles: InitKeyBundle = await getKeyBundle(chat.contact.userId)

    const verifications: boolean[] = await Promise.all(
      keyBundles.keyBundles.map((bundle: InitDeviceKeyBundle) => {
        console.log(`Verify signature for device=${bundle.deviceId}`)
        return verifyPreKeySignature(
          bundle.ed25519identityKey,
          bundle.preKey,
          bundle.preKeySignature,
        )
      }),
    )

    if (verifications.some((v: boolean) => v === false)) {
      throw new Error('Failed to verify signature of devices')
    }

    if (!deviceStore.identityX25519.keyPair) {
      throw new Error('Identity key missing')
    }

    const identityX25519PrivateKey: CryptoKey = deviceStore.identityX25519.keyPair.privateKey

    const generatedSkBundles: Array<GeneratedSecretKeyBundle> = await Promise.all(
      keyBundles.keyBundles.map((bundle: InitDeviceKeyBundle) => {
        return generateSecretKeyForKeyBundle(bundle, identityX25519PrivateKey)
      }),
    )

    for (let i = 0; i < generatedSkBundles.length; i++) {
      const generatedSkBundle: GeneratedSecretKeyBundle = generatedSkBundles[i]

      const newChatState: ChatState = {
        deviceId: generatedSkBundle.deviceId,
        userId: chat.contact.userId,

        x25519publicIdentityKey: null,

        dhSendingKeyPair: null,
        dhReceivingPublicKey: null,
        rootKey: null,

        chainKeySending: null,
        chainKeyReceiving: null,

        skippedMessageKeys: new Map<string, Uint8Array<ArrayBuffer>>(),

        sendingMessageNumber: 0,
        receivingMessageNumber: 0,
        previousChainLength: 0,

        preKeyIdUsed: generatedSkBundle.oneTimePreKeyId,
        ephemeralPublicBytes: generatedSkBundle.ephemeralPublicBytes,
      }

      console.log(
        `Calculated SK: ${uint8ArrayToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', generatedSkBundle.secretKey)))}`,
      )

      console.log(`DH receiving public key: ${uint8ArrayToBase64(generatedSkBundle.preKeyPublic)}`)

      await initRatchetAsSender(
        newChatState,
        new Uint8Array(await crypto.subtle.exportKey('raw', generatedSkBundle.secretKey)),
        generatedSkBundle.preKeyPublic,
      )

      await chatStateRepository.saveChatState(newChatState)
    }
  }

  async function generateSecretKeyForKeyBundle(
    keyBundle: InitDeviceKeyBundle,
    ikSenderPrivate: CryptoKey,
  ): Promise<GeneratedSecretKeyBundle> {
    console.log(`Generate SK for device=${keyBundle.deviceId}`)

    let senderEphemeralKey: CryptoKeyPair | null = (await crypto.subtle.generateKey(
      { name: 'X25519' },
      false,
      ['deriveBits'],
    )) as CryptoKeyPair

    const ikReceiverPublic: CryptoKey = await x25519PublicCryptoKeyForDHFromPublicBytes(
      keyBundle.x25519identityKey,
    )
    const preKeyPublic: CryptoKey = await x25519PublicCryptoKeyForDHFromPublicBytes(
      keyBundle.preKey,
    )
    let oneTimePreKey: CryptoKey | null = null
    if (keyBundle.oneTimePreKey) {
      oneTimePreKey = await x25519PublicCryptoKeyForDHFromPublicBytes(keyBundle.oneTimePreKey)
    }

    let dh1: Uint8Array | null = await calculateDH(ikSenderPrivate, preKeyPublic)
    let dh2: Uint8Array | null = await calculateDH(senderEphemeralKey.privateKey, ikReceiverPublic)
    let dh3: Uint8Array | null = await calculateDH(senderEphemeralKey.privateKey, preKeyPublic)
    let dh4: Uint8Array | null = null
    if (oneTimePreKey) {
      dh4 = await calculateDH(senderEphemeralKey.privateKey, oneTimePreKey)
    }

    let keyMaterial = null
    if (dh4) {
      keyMaterial = new Uint8Array(dh1.length + dh2.length + dh3.length + dh2.length)
      keyMaterial.set(dh1)
      keyMaterial.set(dh2, dh1.length)
      keyMaterial.set(dh3, dh1.length + dh2.length)
      keyMaterial.set(dh4, dh1.length + dh2.length + dh3.length)
    } else {
      console.warn('One time pre key missing!')
      keyMaterial = new Uint8Array(dh1.length + dh2.length + dh3.length + dh2.length)
      keyMaterial.set(dh1)
      keyMaterial.set(dh2, dh1.length)
      keyMaterial.set(dh3, dh1.length + dh2.length)
    }

    let baseKey: CryptoKey | null = await window.crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'HKDF' },
      false,
      ['deriveKey'],
    )

    const secretKey = await window.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        salt: new Uint8Array(32).fill(0),
        info: new TextEncoder().encode(APPLICATION_INFO_STRING),
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    )

    const senderEphemeralKeyPublic = await window.crypto.subtle.exportKey(
      'raw',
      senderEphemeralKey.publicKey,
    )

    senderEphemeralKey = null
    dh1 = null
    dh2 = null
    dh3 = null
    dh4 = null
    keyMaterial = null
    baseKey = null

    console.log(`SK for device=${keyBundle.deviceId} generated!`)
    return {
      deviceId: keyBundle.deviceId,
      x25519publicIdentityKey: keyBundle.x25519identityKey,
      oneTimePreKeyId: keyBundle.oneTimePreKeyId,
      secretKey: secretKey,
      preKeyPublic: keyBundle.preKey,
      ephemeralPublicBytes: new Uint8Array(senderEphemeralKeyPublic),
    }
  }

  async function getIdentityKeys(userId: string): Promise<IdentityKey[]> {
    const response = await fetch(`/api/v1/keys/identity-keys/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (await userStore.getAccessToken()),
      },
    })

    if (!response.ok) {
      const errorBody = await response.text() // Try to get more error details
      console.error('getIdentityKeys() - error body:', errorBody)
      throw new Error(`getIdentityKeys() error! Status: ${response.status}`)
    }

    const result: IdentityKeysResponse = await response.json()

    const parsedIdentityKeys: Array<IdentityKey> = []
    for (let i = 0; i < result.identityKeys.length; i++) {
      const identityKey: IdentityKeyResponse = result.identityKeys[i]
      const identityKeyParsed: IdentityKey = {
        deviceId: identityKey.deviceId,
        x25519PublicKey: base64ToUint8Array(identityKey.x25519PublicKey),
        ed25519PublicKey: base64ToUint8Array(identityKey.ed25519PublicKey),
      }
      parsedIdentityKeys.push(identityKeyParsed)
    }

    return parsedIdentityKeys
  }

  async function getKeyBundle(userId: string): Promise<InitKeyBundle> {
    const response = await fetch(`/api/v1/keys/key-bundle/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (await userStore.getAccessToken()),
      },
    })

    if (!response.ok) {
      const errorBody = await response.text() // Try to get more error details
      console.error('getKeyBundle() - error body:', errorBody)
      throw new Error(`getKeyBundle() error! Status: ${response.status}`)
    }

    const result: InitKeyBundleResponse = await response.json()
    const parsedKeyBundles: Array<InitDeviceKeyBundle> = []
    for (let i = 0; i < result.keyBundles.length; i++) {
      const keyBundle: InitDeviceKeyBundleResponse = result.keyBundles[i]
      const keyBundleParsed: InitDeviceKeyBundle = {
        deviceId: keyBundle.deviceId,

        x25519identityKey: base64ToUint8Array(keyBundle.x25519identityKey),
        ed25519identityKey: base64ToUint8Array(keyBundle.ed25519identityKey),
        preKey: base64ToUint8Array(keyBundle.preKey),
        preKeySignature: base64ToUint8Array(keyBundle.preKeySignature),

        oneTimePreKeyId: keyBundle.oneTimePreKeyId,
        oneTimePreKey: base64ToUint8Array(keyBundle.oneTimePreKey),
      }
      parsedKeyBundles.push(keyBundleParsed)
    }

    return { keyBundles: parsedKeyBundles }
  }

  async function sendMessagePayload(payload: MessagePayload): Promise<SendMessageResponse> {
    const response = await fetch('/api/v1/messages/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (await userStore.getAccessToken()),
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorBody = await response.text() // Try to get more error details
      console.error('sendMessagesPayload() - API error body:', errorBody)
      throw new Error(`sendMessagesPayload() - HTTP error! Status: ${response.status}`)
    }

    const result: SendMessageResponse = await response.json()
    return result
  }

  return {
    sendMessageInCurrentChat,
    fetchAndDecryptOfflineMessages,
    decryptInboundMessageAndPushToChat,
  }
})
