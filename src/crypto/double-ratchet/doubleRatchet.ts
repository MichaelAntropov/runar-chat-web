import { concatBytes } from '@/crypto/encoding/binaryEncoding'

import { createDoubleRatchetSkippedMessageKeyId, decodeDoubleRatchetHeader, encodeDoubleRatchetHeader } from './doubleRatchetEncoding'
import { DoubleRatchetStaleMessageError, DoubleRatchetTooManySkippedMessagesError } from './doubleRatchetErrors'
import { decryptDoubleRatchetPayload, encryptDoubleRatchetPayload } from './doubleRatchetEncryption'
import {
  type DoubleRatchetActiveState,
  type DoubleRatchetChainKey,
  type DoubleRatchetDecryptInput,
  type DoubleRatchetDecryptResult,
  type DoubleRatchetEncryptInput,
  type DoubleRatchetEncryptResult,
  type DoubleRatchetHeader,
  type DoubleRatchetInitiatorInitInput,
  type DoubleRatchetInitKeyPair,
  type DoubleRatchetKeyPair,
  type DoubleRatchetMessageKey,
  type DoubleRatchetPublicKeyBytes,
  type DoubleRatchetReceiverInitialState,
  type DoubleRatchetReceiverInitInput,
  type DoubleRatchetRootKey,
  type DoubleRatchetSecretKey,
  type DoubleRatchetSkippedMessageKeyId,
  type DoubleRatchetSendingInitialState,
  type SkippedDoubleRatchetMessageKey,
} from './doubleRatchetTypes'

const X25519_KEY_LENGTH = 32
const ROOT_KDF_INFO = new TextEncoder().encode('runar-chat/double-ratchet/root/v1')
const MESSAGE_KEY_CONSTANT = new Uint8Array([0x01])
const CHAIN_KEY_CONSTANT = new Uint8Array([0x02])
const MAX_UINT32 = 0xffffffff
const MAX_SKIPPED_MESSAGE_KEYS = 1000

interface DoubleRatchetWorkingState {
  localRatchetKeyPair: DoubleRatchetKeyPair
  remoteRatchetPublicKey: DoubleRatchetPublicKeyBytes | null
  rootKey: DoubleRatchetRootKey
  sendingChainKey: DoubleRatchetChainKey | null
  receivingChainKey: DoubleRatchetChainKey | null
  sendingMessageNumber: number
  receivingMessageNumber: number
  previousSendingChainLength: number
}

interface RootKdfResult {
  readonly rootKey: DoubleRatchetRootKey
  readonly chainKey: DoubleRatchetChainKey
}

interface ChainKdfResult {
  readonly chainKey: DoubleRatchetChainKey
  readonly messageKey: DoubleRatchetMessageKey
}

interface SendingChainAdvanceResult {
  readonly messageKey: DoubleRatchetMessageKey
  readonly messageNumber: number
  readonly nextState: DoubleRatchetSendingInitialState | DoubleRatchetActiveState
}

export async function initializeDoubleRatchetAsInitiator(input: DoubleRatchetInitiatorInitInput): Promise<DoubleRatchetSendingInitialState> {
  validateSharedSecret(input.sharedSecret)
  validateX25519PublicKey(input.receiverInitialRatchetPublicKey)

  const localRatchetKeyPair: DoubleRatchetKeyPair = await generateDoubleRatchetKeyPair()
  const remoteRatchetPublicKey: DoubleRatchetPublicKeyBytes = await exportDoubleRatchetPublicKey(input.receiverInitialRatchetPublicKey)

  let dhOutput: Uint8Array<ArrayBuffer> | undefined
  try {
    dhOutput = await calculateDoubleRatchetDH(localRatchetKeyPair.secretKey, input.receiverInitialRatchetPublicKey)

    const { rootKey, chainKey } = await deriveRootAndChainKeys(input.sharedSecret, dhOutput)

    return {
      localRatchetKeyPair: localRatchetKeyPair,
      remoteRatchetPublicKey: remoteRatchetPublicKey,
      rootKey: rootKey,
      sendingChainKey: chainKey,
      receivingChainKey: null,
      sendingMessageNumber: 0,
      receivingMessageNumber: 0,
      previousSendingChainLength: 0,
    }
  } finally {
    dhOutput?.fill(0)
  }
}

export async function initializeDoubleRatchetAsReceiver(input: DoubleRatchetReceiverInitInput): Promise<DoubleRatchetReceiverInitialState> {
  validateSharedSecret(input.sharedSecret)
  validateDoubleRatchetInitKeyPair(input.receiverInitialRatchetKeyPair)

  const localRatchetKeyPair: DoubleRatchetKeyPair = {
    secretKey: input.receiverInitialRatchetKeyPair.secretKey as DoubleRatchetSecretKey,
    publicKey: await exportDoubleRatchetPublicKey(input.receiverInitialRatchetKeyPair.publicKey),
  }

  return {
    localRatchetKeyPair: localRatchetKeyPair,
    remoteRatchetPublicKey: null,
    rootKey: input.sharedSecret.slice() as DoubleRatchetRootKey,
    sendingChainKey: null,
    receivingChainKey: null,
    sendingMessageNumber: 0,
    receivingMessageNumber: 0,
    previousSendingChainLength: 0,
  }
}

export async function encryptMessage(input: DoubleRatchetEncryptInput): Promise<DoubleRatchetEncryptResult> {
  validateBytes(input.plaintext, 'Double Ratchet plaintext')
  validateBytes(input.associatedData, 'Double Ratchet associated data')
  validateSendingMessageNumber(input.state.sendingMessageNumber)

  let advanceResult: SendingChainAdvanceResult | undefined
  let authenticatedData: Uint8Array<ArrayBuffer> | undefined
  let operationSucceeded = false

  try {
    advanceResult = await advanceDoubleRatchetSendingChain(input.state)

    const encodedHeader = encodeDoubleRatchetHeader({
      ratchetPublicKey: input.state.localRatchetKeyPair.publicKey,
      previousChainLength: input.state.previousSendingChainLength,
      messageNumber: advanceResult.messageNumber,
    })

    authenticatedData = concatBytes([input.associatedData, encodedHeader])

    const cipherText = await encryptDoubleRatchetPayload({
      messageKey: advanceResult.messageKey,
      plaintext: input.plaintext,
      associatedData: authenticatedData,
    })

    operationSucceeded = true

    return {
      encryptedMessage: {
        encodedHeader,
        cipherText,
      },
      nextState: advanceResult.nextState,
    } as DoubleRatchetEncryptResult
  } finally {
    advanceResult?.messageKey.fill(0)
    authenticatedData?.fill(0)

    if (!operationSucceeded) {
      advanceResult?.nextState.sendingChainKey.fill(0)
    }
  }
}

export async function decryptMessage(input: DoubleRatchetDecryptInput): Promise<DoubleRatchetDecryptResult> {
  validateBytes(input.associatedData, 'Double Ratchet associated data')

  const header = decodeDoubleRatchetHeader(input.encryptedMessage.encodedHeader)
  const skippedMessageKeyId = createDoubleRatchetSkippedMessageKeyId(header.ratchetPublicKey, header.messageNumber)
  const skippedMessageKey = input.skippedMessageKeys.get(skippedMessageKeyId)
  const authenticatedData = concatBytes([input.associatedData, input.encryptedMessage.encodedHeader])

  try {
    if (skippedMessageKey !== undefined) {
      validateSkippedMessageKey(skippedMessageKey, skippedMessageKeyId, header)

      return {
        plaintext: await decryptDoubleRatchetPayload({
          messageKey: skippedMessageKey.messageKey,
          cipherText: input.encryptedMessage.cipherText,
          associatedData: authenticatedData,
        }),
        stateChange: {
          nextCoreState: input.state,
          skippedMessageKeys: {
            added: [],
            consumed: skippedMessageKeyId,
          },
        },
      }
    }

    return await decryptWithReceivingChain(input, header, authenticatedData)
  } finally {
    authenticatedData.fill(0)
  }
}

async function decryptWithReceivingChain(
  input: DoubleRatchetDecryptInput,
  header: DoubleRatchetHeader,
  authenticatedData: Uint8Array<ArrayBuffer>
): Promise<DoubleRatchetDecryptResult> {
  validateReceivingMessageNumber(header.messageNumber)

  if (input.skippedMessageKeys.size > MAX_SKIPPED_MESSAGE_KEYS) {
    throw new DoubleRatchetTooManySkippedMessagesError()
  }

  const workingState: DoubleRatchetWorkingState = { ...input.state }
  const addedSkippedMessageKeys: SkippedDoubleRatchetMessageKey[] = []
  const addedSkippedMessageKeyIds = new Set<DoubleRatchetSkippedMessageKeyId>()
  const ownedSecrets = new Set<Uint8Array<ArrayBuffer>>()
  const retainedSecrets = new Set<Uint8Array<ArrayBuffer>>()

  try {
    if (workingState.remoteRatchetPublicKey === null || !equalDoubleRatchetPublicKeys(workingState.remoteRatchetPublicKey, header.ratchetPublicKey)) {
      await skipDoubleRatchetMessageKeys(
        workingState,
        header.previousChainLength,
        input,
        addedSkippedMessageKeys,
        addedSkippedMessageKeyIds,
        ownedSecrets
      )
      await performDoubleRatchetStep(workingState, header.ratchetPublicKey, ownedSecrets)
    }

    await skipDoubleRatchetMessageKeys(workingState, header.messageNumber, input, addedSkippedMessageKeys, addedSkippedMessageKeyIds, ownedSecrets)

    if (workingState.receivingChainKey === null) {
      throw new TypeError('Double Ratchet state does not have a receiving chain')
    }

    const { chainKey, messageKey } = await deriveChainKeys(workingState.receivingChainKey)
    ownedSecrets.add(chainKey)
    ownedSecrets.add(messageKey)
    workingState.receivingChainKey = chainKey
    workingState.receivingMessageNumber += 1

    const nextCoreState = toDoubleRatchetActiveState(workingState)
    const plaintext = await decryptDoubleRatchetPayload({
      messageKey,
      cipherText: input.encryptedMessage.cipherText,
      associatedData: authenticatedData,
    })

    retainStateSecrets(nextCoreState, retainedSecrets)
    for (const skippedKey of addedSkippedMessageKeys) {
      retainedSecrets.add(skippedKey.messageKey)
    }

    return {
      plaintext,
      stateChange: {
        nextCoreState,
        skippedMessageKeys: {
          added: addedSkippedMessageKeys,
          consumed: null,
        },
      },
    }
  } finally {
    for (const secret of ownedSecrets) {
      if (!retainedSecrets.has(secret)) {
        secret.fill(0)
      }
    }
  }
}

async function skipDoubleRatchetMessageKeys(
  state: DoubleRatchetWorkingState,
  until: number,
  input: DoubleRatchetDecryptInput,
  addedKeys: SkippedDoubleRatchetMessageKey[],
  addedKeyIds: Set<DoubleRatchetSkippedMessageKeyId>,
  ownedSecrets: Set<Uint8Array<ArrayBuffer>>
): Promise<void> {
  if (until < state.receivingMessageNumber) {
    throw new DoubleRatchetStaleMessageError()
  }

  const skippedCount = until - state.receivingMessageNumber
  if (skippedCount > MAX_SKIPPED_MESSAGE_KEYS || input.skippedMessageKeys.size + addedKeys.length + skippedCount > MAX_SKIPPED_MESSAGE_KEYS) {
    throw new DoubleRatchetTooManySkippedMessagesError()
  }

  if (state.receivingChainKey === null) {
    return
  }

  if (state.remoteRatchetPublicKey === null) {
    throw new TypeError('Double Ratchet receiving chain does not have a remote ratchet key')
  }

  while (state.receivingMessageNumber < until) {
    const { chainKey, messageKey } = await deriveChainKeys(state.receivingChainKey)
    ownedSecrets.add(chainKey)
    ownedSecrets.add(messageKey)

    const id = createDoubleRatchetSkippedMessageKeyId(state.remoteRatchetPublicKey, state.receivingMessageNumber)

    if (input.skippedMessageKeys.has(id) || addedKeyIds.has(id)) {
      throw new DoubleRatchetStaleMessageError()
    }

    addedKeys.push({
      id,
      ratchetPublicKey: state.remoteRatchetPublicKey,
      messageNumber: state.receivingMessageNumber,
      messageKey,
    })
    addedKeyIds.add(id)
    state.receivingChainKey = chainKey
    state.receivingMessageNumber += 1
  }
}

async function performDoubleRatchetStep(
  state: DoubleRatchetWorkingState,
  remoteRatchetPublicKey: DoubleRatchetPublicKeyBytes,
  ownedSecrets: Set<Uint8Array<ArrayBuffer>>
): Promise<void> {
  const importedRemoteRatchetPublicKey = await importDoubleRatchetPublicKey(remoteRatchetPublicKey)

  state.previousSendingChainLength = state.sendingMessageNumber
  state.sendingMessageNumber = 0
  state.receivingMessageNumber = 0
  state.remoteRatchetPublicKey = remoteRatchetPublicKey

  let receivingDhOutput: Uint8Array<ArrayBuffer> | undefined
  let sendingDhOutput: Uint8Array<ArrayBuffer> | undefined

  try {
    receivingDhOutput = await calculateDoubleRatchetDH(state.localRatchetKeyPair.secretKey, importedRemoteRatchetPublicKey)
    const receivingKeys = await deriveRootAndChainKeys(state.rootKey, receivingDhOutput)
    ownedSecrets.add(receivingKeys.rootKey)
    ownedSecrets.add(receivingKeys.chainKey)
    state.rootKey = receivingKeys.rootKey
    state.receivingChainKey = receivingKeys.chainKey

    state.localRatchetKeyPair = await generateDoubleRatchetKeyPair()
    sendingDhOutput = await calculateDoubleRatchetDH(state.localRatchetKeyPair.secretKey, importedRemoteRatchetPublicKey)
    const sendingKeys = await deriveRootAndChainKeys(state.rootKey, sendingDhOutput)
    ownedSecrets.add(sendingKeys.rootKey)
    ownedSecrets.add(sendingKeys.chainKey)
    state.rootKey = sendingKeys.rootKey
    state.sendingChainKey = sendingKeys.chainKey
  } finally {
    receivingDhOutput?.fill(0)
    sendingDhOutput?.fill(0)
  }
}

async function deriveChainKeys(chainKey: DoubleRatchetChainKey): Promise<ChainKdfResult> {
  validateKeyLength(chainKey, 'Double Ratchet chain key')

  const hmacKey = await globalThis.crypto.subtle.importKey('raw', chainKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])

  const [messageKey, nextChainKey] = await Promise.all([
    globalThis.crypto.subtle.sign('HMAC', hmacKey, MESSAGE_KEY_CONSTANT),
    globalThis.crypto.subtle.sign('HMAC', hmacKey, CHAIN_KEY_CONSTANT),
  ])

  return {
    chainKey: new Uint8Array(nextChainKey) as DoubleRatchetChainKey,
    messageKey: new Uint8Array(messageKey) as DoubleRatchetMessageKey,
  }
}

async function advanceDoubleRatchetSendingChain(
  state: DoubleRatchetSendingInitialState | DoubleRatchetActiveState
): Promise<SendingChainAdvanceResult> {
  const { chainKey, messageKey } = await deriveChainKeys(state.sendingChainKey)
  const messageNumber = state.sendingMessageNumber
  return {
    messageKey,
    messageNumber,
    nextState: {
      ...state,
      sendingChainKey: chainKey,
      sendingMessageNumber: state.sendingMessageNumber + 1,
    },
  } as SendingChainAdvanceResult
}

async function deriveRootAndChainKeys(rootKey: Uint8Array<ArrayBuffer>, dhOutput: Uint8Array<ArrayBuffer>): Promise<RootKdfResult> {
  const hkdfKey = await globalThis.crypto.subtle.importKey('raw', dhOutput, 'HKDF', false, ['deriveBits'])

  const derivedBytes = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: rootKey,
        info: ROOT_KDF_INFO,
      },
      hkdfKey,
      X25519_KEY_LENGTH * 2 * 8
    )
  )

  try {
    return {
      rootKey: derivedBytes.slice(0, X25519_KEY_LENGTH) as DoubleRatchetRootKey,
      chainKey: derivedBytes.slice(X25519_KEY_LENGTH) as DoubleRatchetChainKey,
    }
  } finally {
    derivedBytes.fill(0)
  }
}

async function generateDoubleRatchetKeyPair(): Promise<DoubleRatchetKeyPair> {
  const keyPair = (await globalThis.crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits'])) as CryptoKeyPair

  return {
    secretKey: keyPair.privateKey as DoubleRatchetSecretKey,
    publicKey: await exportDoubleRatchetPublicKey(keyPair.publicKey),
  }
}

async function exportDoubleRatchetPublicKey(publicKey: CryptoKey): Promise<DoubleRatchetPublicKeyBytes> {
  const encodedPublicKey = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', publicKey))

  if (encodedPublicKey.byteLength !== X25519_KEY_LENGTH) {
    throw new RangeError(`X25519 public key must be ${X25519_KEY_LENGTH} bytes`)
  }

  return encodedPublicKey as DoubleRatchetPublicKeyBytes
}

async function importDoubleRatchetPublicKey(publicKey: DoubleRatchetPublicKeyBytes): Promise<CryptoKey> {
  validateKeyLength(publicKey, 'Double Ratchet public key')
  return await globalThis.crypto.subtle.importKey('raw', publicKey, { name: 'X25519' }, false, [])
}

async function calculateDoubleRatchetDH(secretKey: DoubleRatchetSecretKey, publicKey: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const dhOutput = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'X25519',
      public: publicKey,
    },
    secretKey,
    X25519_KEY_LENGTH * 8
  )

  return new Uint8Array(dhOutput)
}

function validateSharedSecret(sharedSecret: Uint8Array<ArrayBuffer>): void {
  if (!(sharedSecret instanceof Uint8Array)) {
    throw new TypeError('Double Ratchet shared secret must be a Uint8Array')
  }

  if (sharedSecret.byteLength !== X25519_KEY_LENGTH) {
    throw new RangeError(`Double Ratchet shared secret must be ${X25519_KEY_LENGTH} bytes`)
  }
}

function validateKeyLength(key: Uint8Array<ArrayBuffer>, name: string): void {
  validateBytes(key, name)
  if (key.byteLength !== X25519_KEY_LENGTH) {
    throw new RangeError(`${name} must be ${X25519_KEY_LENGTH} bytes`)
  }
}

function validateBytes(value: Uint8Array<ArrayBuffer>, name: string): void {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${name} must be a Uint8Array`)
  }
}

function validateSendingMessageNumber(messageNumber: number): void {
  if (!Number.isSafeInteger(messageNumber) || messageNumber < 0 || messageNumber >= MAX_UINT32) {
    throw new RangeError('Double Ratchet sending message number cannot be advanced')
  }
}

function validateReceivingMessageNumber(messageNumber: number): void {
  if (!Number.isSafeInteger(messageNumber) || messageNumber < 0 || messageNumber >= MAX_UINT32) {
    throw new RangeError('Double Ratchet receiving message number cannot be advanced')
  }
}

function validateSkippedMessageKey(
  skippedMessageKey: SkippedDoubleRatchetMessageKey,
  expectedId: DoubleRatchetSkippedMessageKeyId,
  header: DoubleRatchetHeader
): void {
  const actualId = createDoubleRatchetSkippedMessageKeyId(skippedMessageKey.ratchetPublicKey, skippedMessageKey.messageNumber)

  if (
    skippedMessageKey.id !== expectedId ||
    actualId !== expectedId ||
    skippedMessageKey.messageNumber !== header.messageNumber ||
    !equalDoubleRatchetPublicKeys(skippedMessageKey.ratchetPublicKey, header.ratchetPublicKey)
  ) {
    throw new TypeError('Skipped Double Ratchet message key does not match its identifier')
  }

  validateKeyLength(skippedMessageKey.messageKey, 'Skipped Double Ratchet message key')
}

function equalDoubleRatchetPublicKeys(left: DoubleRatchetPublicKeyBytes, right: DoubleRatchetPublicKeyBytes): boolean {
  if (left.byteLength !== X25519_KEY_LENGTH || right.byteLength !== X25519_KEY_LENGTH) {
    return false
  }

  for (let index = 0; index < X25519_KEY_LENGTH; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

function toDoubleRatchetActiveState(state: DoubleRatchetWorkingState): DoubleRatchetActiveState {
  if (state.remoteRatchetPublicKey === null || state.sendingChainKey === null || state.receivingChainKey === null) {
    throw new TypeError('Double Ratchet state is not active')
  }

  return {
    localRatchetKeyPair: state.localRatchetKeyPair,
    remoteRatchetPublicKey: state.remoteRatchetPublicKey,
    rootKey: state.rootKey,
    sendingChainKey: state.sendingChainKey,
    receivingChainKey: state.receivingChainKey,
    sendingMessageNumber: state.sendingMessageNumber,
    receivingMessageNumber: state.receivingMessageNumber,
    previousSendingChainLength: state.previousSendingChainLength,
  }
}

function retainStateSecrets(state: DoubleRatchetActiveState, retainedSecrets: Set<Uint8Array<ArrayBuffer>>): void {
  retainedSecrets.add(state.rootKey)
  retainedSecrets.add(state.sendingChainKey)
  retainedSecrets.add(state.receivingChainKey)
}

function validateX25519PublicKey(publicKey: CryptoKey): void {
  if (publicKey.type !== 'public' || publicKey.algorithm.name !== 'X25519') {
    throw new TypeError('Receiver initial ratchet key must be an X25519 public key')
  }
}
function validateDoubleRatchetInitKeyPair(keyPair: DoubleRatchetInitKeyPair) {
  if (keyPair.secretKey.type !== 'private' || keyPair.secretKey.algorithm.name !== 'X25519') {
    throw new TypeError('Double Ratchet DH key pair secret key must be an X25519 private key')
  }

  if (!keyPair.secretKey.usages.includes('deriveBits')) {
    throw new TypeError('Double Ratchet DH key pair secret key must have deriveBits usage')
  }

  if (keyPair.publicKey.type !== 'public' || keyPair.publicKey.algorithm.name !== 'X25519') {
    throw new TypeError('Double Ratchet DH key pair public key must be an X25519 public key')
  }
}
