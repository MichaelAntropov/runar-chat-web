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
import { CHAT_STATES_STORE, db, MESSAGES_STORE, PRE_KEYS_STORE } from '@/db/DbStorage'
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
import type { KdfRkPair } from './interfaces/ratchet/KdfRkPair'
import type { KdfCkPair } from './interfaces/ratchet/KdfCkPair'
import { SkippedMessageIdentifier } from './interfaces/ratchet/SkippedMessageIdentifier'
import type { ChatState } from './interfaces/chat/ChatState'
import type { ParsedHeader } from './interfaces/ratchet/ParsedHeader'
import type { RatchetSendResult } from './interfaces/ratchet/RatchetSendResult'
import type { RatchetEncryptResult } from './interfaces/ratchet/RatchetEncryptResult'

const APPLICATION_INFO_STRING = 'QuarkusChatSecure'
const DOUBLE_RATCHET_INFO_STRING = 'QuarkusChatSecureRatchet'
const DOUBLE_RATCHET_AES_INFO_STRING = 'QuarkusChatSecureRatchetAES'

const INT_SIZE = 4
const DH_KEY_LENGTH = 32
const HASH_OUTPUT_LEN = 32 // For SHA-256
const KEY_LEN = 32
const AES_KEY_LEN = 32 // AES-256
const GCM_IV_LEN = 12 // GCM nonce length
const GCM_TAG_LEN = 128 // GCM Tag length in bits

const MESSAGE_KEY_CONSTANT = new Uint8Array([0x01])
const CHAIN_KEY_CONSTANT = new Uint8Array([0x02])

const MAX_SKIP = 30

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

        await db[CHAT_STATES_STORE].put(chatState)

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

    await db[MESSAGES_STORE].add(newStoredMessage)
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

    await db[CHAT_STATES_STORE].put(chatState)

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
    return db[CHAT_STATES_STORE].where('deviceId').equals(deviceId).first()
  }

  async function getEstablishedChatStatesForChat(chat: Chat): Promise<ChatState[]> {
    console.log('Get existing chat states...')
    return db[CHAT_STATES_STORE].where('userId').equals(chat.contact.userId).toArray()
  }

  async function establishChatStateForDeviceId(
    senderUserId: string,
    senderDeviceId: string,
    ephemeralKey: Uint8Array<ArrayBuffer>,
    preKeyIdUsed: string | null,
  ) {
    let oneTimePreKey: OneTimePreKeyState | undefined
    if (preKeyIdUsed) {
      oneTimePreKey = await db[PRE_KEYS_STORE].get(preKeyIdUsed)
      await db[PRE_KEYS_STORE].delete(preKeyIdUsed)
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
    await db[CHAT_STATES_STORE].put(newChatState)
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

      await db[CHAT_STATES_STORE].add(newChatState)
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

async function verifyPreKeySignature(
  ed25519PublicKeyRaw: Uint8Array<ArrayBuffer>,
  preKey: Uint8Array<ArrayBuffer>,
  preKeySignature: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  if (
    !ed25519PublicKeyRaw ||
    ed25519PublicKeyRaw.length !== 32 ||
    !preKey ||
    preKey.length !== 32 ||
    !preKeySignature ||
    preKeySignature.length !== 64
  ) {
    console.warn(
      'Invalid input parameters for signature verification: Check lengths (PublicKey: 32, PreKey: 32, Signature: 64) and ensure values are not null/undefined.',
    )
    return false
  }

  if (!window.crypto || !window.crypto.subtle) {
    console.error(
      'Web Cryptography API (window.crypto.subtle) is not available in this browser environment.',
    )
    return false
  }

  try {
    const publicKey: CryptoKey = await window.crypto.subtle.importKey(
      'raw',
      ed25519PublicKeyRaw,
      { name: 'Ed25519' },
      false,
      ['verify'],
    )

    const isValid: boolean = await window.crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      preKeySignature,
      preKey,
    )

    return isValid
  } catch (error) {
    console.error(
      `Signature verification failed during Web Crypto operation: ${error instanceof Error ? error.message : String(error)}`,
      error,
    )
    return false
  }
}

async function calculateDH(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  const resultBuffer = await window.crypto.subtle.deriveBits(
    {
      name: 'X25519',
      public: publicKey,
    },
    privateKey,
    256,
  )

  return new Uint8Array(resultBuffer)
}

async function x25519PublicCryptoKeyForDHFromPublicBytes(
  publicKeyBytes: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  if (!(publicKeyBytes instanceof Uint8Array)) {
    throw new TypeError('publicKeyBytes must be a Uint8Array.')
  }

  if (publicKeyBytes.byteLength !== 32) {
    console.warn(
      `Warning: X25519 public key should be 32 bytes. Provided length: ${publicKeyBytes.byteLength}.`,
    )
  }

  try {
    const publicKey = await window.crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'X25519' },
      true,
      [],
    )
    return publicKey
  } catch (error) {
    console.error('Error importing X25519 public key:', error)
    throw error
  }
}

async function initRatchetAsSender(
  chatState: ChatState,
  secretKey: Uint8Array<ArrayBuffer>,
  dhReceivingPublicKey: Uint8Array<ArrayBuffer>,
) {
  chatState.dhSendingKeyPair = await generateKeyPair()
  chatState.dhReceivingPublicKey = dhReceivingPublicKey

  const dh: Uint8Array<ArrayBuffer> = await calculateDH(
    chatState.dhSendingKeyPair.privateKey,
    await x25519PublicCryptoKeyForDHFromPublicBytes(dhReceivingPublicKey),
  )
  console.log(`initRatchetAsSender() - DH: ${uint8ArrayToBase64(dh)}`)
  const kdfRkPair: KdfRkPair = await getKdfRkPair(secretKey, dh)

  chatState.rootKey = kdfRkPair.rootKey
  chatState.chainKeySending = kdfRkPair.chainKey
  console.log(
    `initRatchetAsSender() - ChainKey Sending: ${uint8ArrayToBase64(chatState.chainKeySending)}`,
  )
}

async function initRatchetAsReceiver(
  chatState: ChatState,
  secretKey: Uint8Array<ArrayBuffer>,
  dhReceivingPrivateKey: CryptoKey,
  dhReceivingPublicKey: CryptoKey,
) {
  chatState.dhSendingKeyPair = {
    privateKey: dhReceivingPrivateKey,
    publicKey: dhReceivingPublicKey,
  }
  chatState.dhReceivingPublicKey = null
  chatState.rootKey = secretKey
}

async function ratchetEncrypt(
  chatState: ChatState,
  messageContentToEncrypt: Uint8Array<ArrayBuffer>,
  associatedData: Uint8Array<ArrayBuffer>,
): Promise<RatchetEncryptResult> {
  if (!chatState.dhSendingKeyPair) {
    throw new Error('Empty chatState.dhSendingKeyPair was provided')
  }

  const ratchetSendResult: RatchetSendResult = await getRatchetSendMessageKey(chatState)
  const header: Uint8Array<ArrayBuffer> = getHeader(
    new Uint8Array(await crypto.subtle.exportKey('raw', chatState.dhSendingKeyPair.publicKey)),
    chatState.previousChainLength,
    ratchetSendResult.messageNumber,
  )
  const associatedDataWithHeader = new Uint8Array(associatedData.length + header.length)
  associatedDataWithHeader.set(associatedData)
  associatedDataWithHeader.set(header, associatedData.length)

  const encryptedPayload: Uint8Array<ArrayBuffer> = await encryptPayload(
    ratchetSendResult.messageKey,
    messageContentToEncrypt,
    associatedDataWithHeader,
  )

  return { header: header, encryptedPayload: encryptedPayload }
}

async function ratchetDecrypt(
  chatState: ChatState,
  header: Uint8Array<ArrayBuffer>,
  encryptedPayload: Uint8Array<ArrayBuffer>,
  associatedData: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const associatedDataWithHeader = new Uint8Array(associatedData.length + header.length)
  associatedDataWithHeader.set(associatedData)
  associatedDataWithHeader.set(header, associatedData.length)

  const messageKey: Uint8Array<ArrayBuffer> = await getRatchetReceiveMessageKey(chatState, header)
  return await decryptPayload(messageKey, encryptedPayload, associatedDataWithHeader)
}

async function getRatchetReceiveMessageKey(
  chatState: ChatState,
  header: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const parsedHeader: ParsedHeader = parseHeader(header)
  let messageKey: Uint8Array<ArrayBuffer> | undefined = getMessageKeyFromSkippedMessageKeys(
    chatState,
    parsedHeader.dhKeyPublic,
    parsedHeader.messageNumber,
  )

  if (messageKey) {
    return messageKey
  }

  if (
    !chatState.dhReceivingPublicKey ||
    !arraysEqual(parsedHeader.dhKeyPublic, chatState.dhReceivingPublicKey)
  ) {
    await skipMessageKey(chatState, parsedHeader.previousChainLength)
    await updateRatchetStateFromHeader(chatState, parsedHeader.dhKeyPublic)
  }
  await skipMessageKey(chatState, parsedHeader.messageNumber)
  if (!chatState.chainKeyReceiving) {
    throw new Error('Empty chatState.chainKeyReceiving was provided')
  }
  const kdfCkPair: KdfCkPair = await getKdfCkPair(chatState.chainKeyReceiving)
  chatState.chainKeyReceiving = kdfCkPair.chainKey
  messageKey = kdfCkPair.messageKey
  chatState.receivingMessageNumber++
  return messageKey
}

async function getRatchetSendMessageKey(chatState: ChatState): Promise<RatchetSendResult> {
  if (!chatState.chainKeySending) {
    throw new Error('Empty chainKeySending was provided')
  }
  const kdfCkPair: KdfCkPair = await getKdfCkPair(chatState.chainKeySending)
  chatState.chainKeySending = kdfCkPair.chainKey
  const messageNumber = chatState.sendingMessageNumber
  chatState.sendingMessageNumber++
  return { messageNumber: messageNumber, messageKey: kdfCkPair.messageKey }
}

async function updateRatchetStateFromHeader(
  chatState: ChatState,
  dhPublicKey: Uint8Array<ArrayBuffer>,
) {
  if (!chatState.rootKey) {
    throw new Error('Empty chatState.rootKey was provided')
  }

  if (!chatState.dhSendingKeyPair) {
    throw new Error('Empty chatState.dhSendingKeyPair was provided')
  }

  chatState.previousChainLength = chatState.sendingMessageNumber
  chatState.sendingMessageNumber = 0
  chatState.receivingMessageNumber = 0
  chatState.dhReceivingPublicKey = dhPublicKey

  const receivingDh: Uint8Array<ArrayBuffer> = await calculateDH(
    chatState.dhSendingKeyPair.privateKey,
    await x25519PublicCryptoKeyForDHFromPublicBytes(chatState.dhReceivingPublicKey),
  )
  console.log(`updateRatchetStateFromHeader() - Receiving DH: ${uint8ArrayToBase64(receivingDh)}`)

  const newKdfRkReceivingPair: KdfRkPair = await getKdfRkPair(chatState.rootKey, receivingDh)
  chatState.rootKey = newKdfRkReceivingPair.rootKey
  chatState.chainKeyReceiving = newKdfRkReceivingPair.chainKey
  console.log(
    `updateRatchetStateFromHeader() - ChainKey Receiving: ${uint8ArrayToBase64(chatState.chainKeyReceiving)}`,
  )

  chatState.dhSendingKeyPair = await generateKeyPair()

  const sendingDh = await calculateDH(
    chatState.dhSendingKeyPair.privateKey,
    await x25519PublicCryptoKeyForDHFromPublicBytes(chatState.dhReceivingPublicKey),
  )
  console.log(`updateRatchetStateFromHeader() - Sending DH: ${uint8ArrayToBase64(sendingDh)}`)
  const newKdfRkSendingPair: KdfRkPair = await getKdfRkPair(chatState.rootKey, sendingDh)
  chatState.rootKey = newKdfRkSendingPair.rootKey
  chatState.chainKeySending = newKdfRkSendingPair.chainKey
}

async function skipMessageKey(chatState: ChatState, until: number) {
  if (chatState.receivingMessageNumber + MAX_SKIP < until) {
    throw new Error('Amount to be skipped is more than Nr + MAX_SKIP')
  }

  if (chatState.chainKeyReceiving) {
    while (chatState.receivingMessageNumber < until) {
      console.log(
        `skipMessageKey() - chatState.receivingMessageNumber=${chatState.receivingMessageNumber} and until=${until}`,
      )
      const kdfCkPair = await getKdfCkPair(chatState.chainKeyReceiving)
      chatState.chainKeyReceiving = kdfCkPair.chainKey
      const skippedMessageKey = kdfCkPair.messageKey

      if (!chatState.dhReceivingPublicKey) {
        throw new Error('Empty chatState.dhReceivingPublicKey was provided')
      }

      const identifier = new SkippedMessageIdentifier(
        chatState.dhReceivingPublicKey,
        chatState.receivingMessageNumber,
      )
      chatState.skippedMessageKeys.set(identifier.toKey(), skippedMessageKey)
      chatState.receivingMessageNumber++
    }
  }
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  try {
    const keyPair: CryptoKeyPair = (await crypto.subtle.generateKey(
      { name: 'X25519' },
      false, // Allows exporting public key, but not private
      ['deriveBits'],
    )) as CryptoKeyPair

    return keyPair
  } catch (error: unknown) {
    console.error('Error generating X25519 key pair:', error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate X25519 key: ${message}`)
  }
}

async function getKdfRkPair(
  salt: Uint8Array<ArrayBuffer>,
  keyMaterial: Uint8Array<ArrayBuffer>,
): Promise<KdfRkPair> {
  const info = new TextEncoder().encode(DOUBLE_RATCHET_INFO_STRING)

  const baseKey = await crypto.subtle.importKey('raw', keyMaterial, 'HKDF', false, ['deriveBits'])

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    baseKey,
    (KEY_LEN + KEY_LEN) * 8, // len in bits
  )

  const rootKey: Uint8Array<ArrayBuffer> = new Uint8Array(derivedBits.slice(0, KEY_LEN))
  const chainKey: Uint8Array<ArrayBuffer> = new Uint8Array(
    derivedBits.slice(KEY_LEN, KEY_LEN + KEY_LEN),
  )

  return { rootKey, chainKey }
}

async function getKdfCkPair(chainKey: Uint8Array<ArrayBuffer>): Promise<KdfCkPair> {
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    chainKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const newChainKey = await crypto.subtle.sign('HMAC', hmacKey, CHAIN_KEY_CONSTANT)
  const messageKey = await crypto.subtle.sign('HMAC', hmacKey, MESSAGE_KEY_CONSTANT)

  const newChainKeyTruncated = new Uint8Array(newChainKey.slice(0, KEY_LEN))
  const messageKeyTruncated = new Uint8Array(messageKey.slice(0, KEY_LEN))

  return { chainKey: newChainKeyTruncated, messageKey: messageKeyTruncated }
}

function getMessageKeyFromSkippedMessageKeys(
  chatState: ChatState,
  dhPublicKey: Uint8Array<ArrayBuffer>,
  messageNumber: number,
) {
  const identifier = new SkippedMessageIdentifier(dhPublicKey, messageNumber)
  const key = identifier.toKey()
  if (chatState.skippedMessageKeys.has(key)) {
    const value = chatState.skippedMessageKeys.get(key)
    chatState.skippedMessageKeys.delete(key)
    return value
  }
}

function parseHeader(header: Uint8Array): ParsedHeader {
  const dhKeyPublic = header.slice(0, DH_KEY_LENGTH)

  const view = new DataView(header.buffer, header.byteOffset + DH_KEY_LENGTH, INT_SIZE + INT_SIZE)
  const previousChainLength = view.getInt32(0, false)
  const messageNumber = view.getInt32(INT_SIZE, false)

  return { dhKeyPublic, previousChainLength, messageNumber }
}

function getHeader(
  dhKeyPublic: Uint8Array,
  previousChainLength: number,
  messageNumber: number,
): Uint8Array<ArrayBuffer> {
  if (dhKeyPublic.length !== DH_KEY_LENGTH) {
    throw new Error(`dhKeyPublic must be ${DH_KEY_LENGTH} bytes`)
  }

  const header = new Uint8Array(DH_KEY_LENGTH + INT_SIZE + INT_SIZE)
  header.set(dhKeyPublic, 0)

  const view = new DataView(header.buffer)
  const offset = DH_KEY_LENGTH

  view.setInt32(offset, previousChainLength, false)
  view.setInt32(offset + INT_SIZE, messageNumber, false)

  return header
}

async function deriveAesKeyAndIv(
  messageKey: Uint8Array<ArrayBuffer>,
): Promise<{ aesKey: CryptoKey; iv: Uint8Array<ArrayBuffer> }> {
  const salt = new Uint8Array(HASH_OUTPUT_LEN) // all zeros
  const info = new TextEncoder().encode(DOUBLE_RATCHET_AES_INFO_STRING)

  const hkdfKey = await crypto.subtle.importKey('raw', messageKey, 'HKDF', false, ['deriveBits'])

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    hkdfKey,
    (AES_KEY_LEN + GCM_IV_LEN) * 8, // len in bits
  )

  const derived = new Uint8Array(derivedBits)
  const keyBytes = derived.slice(0, AES_KEY_LEN)
  const iv = derived.slice(AES_KEY_LEN, AES_KEY_LEN + GCM_IV_LEN)

  const aesKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])

  return { aesKey, iv }
}

async function encryptPayload(
  messageKey: Uint8Array<ArrayBuffer>,
  payload: Uint8Array<ArrayBuffer>,
  associatedData: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  console.log(`encryptPayload() - MessageKey: ${uint8ArrayToBase64(messageKey)}`)
  const { aesKey, iv } = await deriveAesKeyAndIv(messageKey)

  const cipherData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: associatedData,
      tagLength: GCM_TAG_LEN,
    },
    aesKey,
    payload,
  )

  return new Uint8Array(cipherData) // contains cipher + tag
}

async function decryptPayload(
  messageKey: Uint8Array<ArrayBuffer>,
  encryptedPayload: Uint8Array<ArrayBuffer>,
  associatedData: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  console.log(`decryptPayload() - MessageKey: ${uint8ArrayToBase64(messageKey)}`)
  const { aesKey, iv } = await deriveAesKeyAndIv(messageKey)

  try {
    const decryptedPayload = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: associatedData,
        tagLength: GCM_TAG_LEN,
      },
      aesKey,
      encryptedPayload,
    )
    return new Uint8Array(decryptedPayload)
  } catch (err) {
    console.log(err)
    throw new Error('Decryption failed (AEAD bad tag or corrupted data)')
  }
}

function arraysEqual(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

export function uint8ArrayToBase64(uint8Array: Uint8Array<ArrayBuffer>): string {
  let binaryString = ''
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i])
  }
  return btoa(binaryString)
}
