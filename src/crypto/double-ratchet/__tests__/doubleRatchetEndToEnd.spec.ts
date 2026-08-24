import { describe, expect, it } from 'vitest'

import {
  decryptMessage,
  encryptMessage,
  initializeDoubleRatchetAsInitiator,
  initializeDoubleRatchetAsReceiver,
} from '@/crypto/double-ratchet/doubleRatchet'
import { DoubleRatchetAuthenticationError, DoubleRatchetStaleMessageError } from '@/crypto/double-ratchet/doubleRatchetErrors'
import type {
  DoubleRatchetActiveState,
  DoubleRatchetCipherText,
  DoubleRatchetDecryptResult,
  DoubleRatchetEncryptedMessage,
  DoubleRatchetSendingInitialState,
  DoubleRatchetSkippedMessageKeyId,
  DoubleRatchetState,
  SkippedDoubleRatchetMessageKey,
} from '@/crypto/double-ratchet/doubleRatchetTypes'
import { generateSpkX25519KeyPair } from '@/crypto/keys/keyGeneration'

type SendingState = DoubleRatchetSendingInitialState | DoubleRatchetActiveState
type SkippedMessageKeys = Map<DoubleRatchetSkippedMessageKeyId, SkippedDoubleRatchetMessageKey>

interface InitializedDoubleRatchetParties {
  readonly initiatorState: DoubleRatchetSendingInitialState
  readonly receiverState: DoubleRatchetState
}

const textEncoder = new TextEncoder()

describe('Double Ratchet end-to-end', () => {
  it('encrypts and decrypts messages in both directions across DH ratchet steps', async () => {
    const { initiatorState, receiverState } = await initializeParties()
    const initiatorSkippedKeys: SkippedMessageKeys = new Map()
    const receiverSkippedKeys: SkippedMessageKeys = new Map()
    const associatedData = encodeText('initiator-device|receiver-device|session')

    const firstPlaintext = encodeText('hello from the initiator')
    const firstEncryption = await encryptMessage({
      state: initiatorState,
      plaintext: firstPlaintext,
      associatedData,
    })
    const firstDecryption = await decryptMessage({
      state: receiverState,
      encryptedMessage: firstEncryption.encryptedMessage,
      associatedData,
      skippedMessageKeys: receiverSkippedKeys,
    })

    expect(firstDecryption.plaintext).toEqual(firstPlaintext)
    expect(firstDecryption.stateChange.skippedMessageKeys).toEqual({
      added: [],
      consumed: null,
    })
    const activeReceiverState = expectActiveState(firstDecryption.stateChange.nextCoreState)

    const replyPlaintext = encodeText('reply from the receiver')
    const replyEncryption = await encryptMessage({
      state: activeReceiverState,
      plaintext: replyPlaintext,
      associatedData,
    })
    const replyDecryption = await decryptMessage({
      state: firstEncryption.nextState,
      encryptedMessage: replyEncryption.encryptedMessage,
      associatedData,
      skippedMessageKeys: initiatorSkippedKeys,
    })

    expect(replyDecryption.plaintext).toEqual(replyPlaintext)
    expect(replyDecryption.stateChange.skippedMessageKeys).toEqual({
      added: [],
      consumed: null,
    })
    const activeInitiatorState = expectActiveState(replyDecryption.stateChange.nextCoreState)
    expect(activeInitiatorState.receivingMessageNumber).toBe(1)
    expect(replyEncryption.nextState.sendingMessageNumber).toBe(1)
  })

  it('stores skipped keys as a delta and consumes delayed messages in any order', async () => {
    const { initiatorState, receiverState } = await initializeParties()
    const associatedData = encodeText('out-of-order session')
    const encryptedMessages: DoubleRatchetEncryptedMessage[] = []
    let currentInitiatorState: SendingState = initiatorState

    for (const plaintext of ['message 0', 'message 1', 'message 2']) {
      const encryption = await encryptMessage({
        state: currentInitiatorState,
        plaintext: encodeText(plaintext),
        associatedData,
      })
      currentInitiatorState = encryption.nextState
      encryptedMessages.push(encryption.encryptedMessage)
    }

    const skippedKeys: SkippedMessageKeys = new Map()
    const thirdDecryption = await decryptMessage({
      state: receiverState,
      encryptedMessage: encryptedMessages[2]!,
      associatedData,
      skippedMessageKeys: skippedKeys,
    })

    expect(decodeText(thirdDecryption.plaintext)).toBe('message 2')
    expect(thirdDecryption.stateChange.skippedMessageKeys.added).toHaveLength(2)
    expect(thirdDecryption.stateChange.skippedMessageKeys.added.map((key) => key.messageNumber)).toEqual([0, 1])
    applySkippedMessageKeyChanges(skippedKeys, thirdDecryption)
    expect(skippedKeys.size).toBe(2)

    const activeReceiverState = expectActiveState(thirdDecryption.stateChange.nextCoreState)
    const firstDecryption = await decryptMessage({
      state: activeReceiverState,
      encryptedMessage: encryptedMessages[0]!,
      associatedData,
      skippedMessageKeys: skippedKeys,
    })

    expect(decodeText(firstDecryption.plaintext)).toBe('message 0')
    expect(firstDecryption.stateChange.nextCoreState).toBe(activeReceiverState)
    expect(firstDecryption.stateChange.skippedMessageKeys.added).toEqual([])
    expect(firstDecryption.stateChange.skippedMessageKeys.consumed).not.toBeNull()
    applySkippedMessageKeyChanges(skippedKeys, firstDecryption)
    expect(skippedKeys.size).toBe(1)

    const secondDecryption = await decryptMessage({
      state: activeReceiverState,
      encryptedMessage: encryptedMessages[1]!,
      associatedData,
      skippedMessageKeys: skippedKeys,
    })

    expect(decodeText(secondDecryption.plaintext)).toBe('message 1')
    applySkippedMessageKeyChanges(skippedKeys, secondDecryption)
    expect(skippedKeys.size).toBe(0)

    await expect(
      decryptMessage({
        state: activeReceiverState,
        encryptedMessage: encryptedMessages[0]!,
        associatedData,
        skippedMessageKeys: skippedKeys,
      })
    ).rejects.toBeInstanceOf(DoubleRatchetStaleMessageError)
  })

  it('uses previousChainLength to preserve delayed messages across a DH ratchet', async () => {
    const { initiatorState, receiverState } = await initializeParties()
    const associatedData = encodeText('previous-chain session')
    const oldChainMessages: DoubleRatchetEncryptedMessage[] = []
    let currentInitiatorState: SendingState = initiatorState

    for (const plaintext of ['old 0', 'old 1', 'old 2']) {
      const encryption = await encryptMessage({
        state: currentInitiatorState,
        plaintext: encodeText(plaintext),
        associatedData,
      })
      currentInitiatorState = encryption.nextState
      oldChainMessages.push(encryption.encryptedMessage)
    }

    const receiverSkippedKeys: SkippedMessageKeys = new Map()
    const firstOldDecryption = await decryptMessage({
      state: receiverState,
      encryptedMessage: oldChainMessages[0]!,
      associatedData,
      skippedMessageKeys: receiverSkippedKeys,
    })
    const activeReceiverState = expectActiveState(firstOldDecryption.stateChange.nextCoreState)

    const replyEncryption = await encryptMessage({
      state: activeReceiverState,
      plaintext: encodeText('ratchet reply'),
      associatedData,
    })
    const initiatorReplyDecryption = await decryptMessage({
      state: currentInitiatorState,
      encryptedMessage: replyEncryption.encryptedMessage,
      associatedData,
      skippedMessageKeys: new Map(),
    })
    const ratchetedInitiatorState = expectActiveState(initiatorReplyDecryption.stateChange.nextCoreState)

    const newChainEncryption = await encryptMessage({
      state: ratchetedInitiatorState,
      plaintext: encodeText('new chain 0'),
      associatedData,
    })
    const newChainDecryption = await decryptMessage({
      state: replyEncryption.nextState,
      encryptedMessage: newChainEncryption.encryptedMessage,
      associatedData,
      skippedMessageKeys: receiverSkippedKeys,
    })

    expect(decodeText(newChainDecryption.plaintext)).toBe('new chain 0')
    expect(newChainDecryption.stateChange.skippedMessageKeys.added.map((key) => key.messageNumber)).toEqual([1, 2])
    applySkippedMessageKeyChanges(receiverSkippedKeys, newChainDecryption)

    const delayedOldMessage = await decryptMessage({
      state: newChainDecryption.stateChange.nextCoreState,
      encryptedMessage: oldChainMessages[2]!,
      associatedData,
      skippedMessageKeys: receiverSkippedKeys,
    })

    expect(decodeText(delayedOldMessage.plaintext)).toBe('old 2')
    expect(delayedOldMessage.stateChange.skippedMessageKeys.consumed).not.toBeNull()
  })

  it('rejects tampering without modifying caller-owned state or skipped keys', async () => {
    const { initiatorState, receiverState } = await initializeParties()
    const associatedData = encodeText('authenticated session')
    const encryption = await encryptMessage({
      state: initiatorState,
      plaintext: encodeText('authentic message'),
      associatedData,
    })
    const modifiedCipherText = encryption.encryptedMessage.cipherText.slice() as DoubleRatchetCipherText
    modifiedCipherText[0] ^= 0x01
    const skippedKeys: SkippedMessageKeys = new Map()
    const rootKeyBeforeDecryption = receiverState.rootKey.slice()

    await expect(
      decryptMessage({
        state: receiverState,
        encryptedMessage: {
          ...encryption.encryptedMessage,
          cipherText: modifiedCipherText,
        },
        associatedData,
        skippedMessageKeys: skippedKeys,
      })
    ).rejects.toBeInstanceOf(DoubleRatchetAuthenticationError)

    expect(receiverState.rootKey).toEqual(rootKeyBeforeDecryption)
    expect(receiverState.receivingMessageNumber).toBe(0)
    expect(receiverState.remoteRatchetPublicKey).toBeNull()
    expect(skippedKeys.size).toBe(0)
  })
})

async function initializeParties(): Promise<InitializedDoubleRatchetParties> {
  const receiverInitialRatchetKeyPair = await generateSpkX25519KeyPair()
  const sharedSecret = globalThis.crypto.getRandomValues(new Uint8Array(32))

  const [initiatorState, receiverState] = await Promise.all([
    initializeDoubleRatchetAsInitiator({
      sharedSecret,
      receiverInitialRatchetPublicKey: receiverInitialRatchetKeyPair.publicKey,
    }),
    initializeDoubleRatchetAsReceiver({
      sharedSecret,
      receiverInitialRatchetKeyPair,
    }),
  ])

  return { initiatorState, receiverState }
}

function applySkippedMessageKeyChanges(skippedKeys: SkippedMessageKeys, result: DoubleRatchetDecryptResult): void {
  for (const skippedKey of result.stateChange.skippedMessageKeys.added) {
    skippedKeys.set(skippedKey.id, skippedKey)
  }

  const consumedKeyId = result.stateChange.skippedMessageKeys.consumed
  if (consumedKeyId !== null) {
    skippedKeys.delete(consumedKeyId)
  }
}

function expectActiveState(state: DoubleRatchetState): DoubleRatchetActiveState {
  expect(state.remoteRatchetPublicKey).not.toBeNull()
  expect(state.sendingChainKey).not.toBeNull()
  expect(state.receivingChainKey).not.toBeNull()

  if (state.remoteRatchetPublicKey === null || state.sendingChainKey === null || state.receivingChainKey === null) {
    throw new TypeError('Expected an active Double Ratchet state')
  }

  return state as DoubleRatchetActiveState
}

function encodeText(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(textEncoder.encode(value))
}

function decodeText(value: Uint8Array<ArrayBuffer>): string {
  return new TextDecoder().decode(value)
}
