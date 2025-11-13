import { uint8ArrayToBase64, arraysEqual } from '@/core/utils'
import type { ChatState } from '../interfaces/chat/ChatState'
import type { KdfCkPair } from './types/KdfCkPair'
import type { KdfRkPair } from './types/KdfRkPair'
import type { ParsedHeader } from './types/ParsedHeader'
import type { RatchetEncryptResult } from './types/RatchetEncryptResult'
import type { RatchetSendResult } from './types/RatchetSendResult'
import { SkippedMessageIdentifier } from './types/SkippedMessageIdentifier'
import { calculateDH, x25519PublicCryptoKeyForDHFromPublicBytes } from './dhke'

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

export async function initRatchetAsSender(
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

export async function initRatchetAsReceiver(
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

export async function ratchetEncrypt(
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

export async function ratchetDecrypt(
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
