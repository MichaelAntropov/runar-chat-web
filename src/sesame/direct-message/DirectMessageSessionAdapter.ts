import {
  decryptMessage,
  encryptMessage,
  initializeDoubleRatchetAsInitiator,
  initializeDoubleRatchetAsReceiver,
} from '@/crypto/double-ratchet/doubleRatchet'
import { DoubleRatchetAuthenticationError, DoubleRatchetStaleMessageError } from '@/crypto/double-ratchet/doubleRatchetErrors'
import type {
  DoubleRatchetSkippedMessageKeyChanges,
  DoubleRatchetSkippedMessageKeyId,
  SkippedDoubleRatchetMessageKey,
} from '@/crypto/double-ratchet/doubleRatchetTypes'
import { concatBytes } from '@/crypto/encoding/binaryEncoding'
import { generateEphemeralX25519KeyPair } from '@/crypto/keys/keyGeneration'
import { verifyCounterpartEd25519Signature } from '@/crypto/keys/keySigning'
import type {
  CounterpartEphemeralX25519PublicKey,
  CounterpartIdentityEd25519PublicKey,
  CounterpartIdentityX25519PublicKey,
  CounterpartOtpkX25519PublicKey,
  CounterpartSpkX25519PublicKey,
} from '@/crypto/keys/keyTypes'
import { calculateX3DHSharedSecretAsInitiator, calculateX3DHSharedSecretAsReceiver } from '@/crypto/x3dh/x3dh'
import { encodeCounterpartMaterialForX3DHPreKeySignatureCheck } from '@/crypto/x3dh/x3dhEncoding'
import type {
  SesameCreatedInitiatingSession,
  SesameCreatedReceivingSession,
  SesameRemoteDevice,
  SesameSessionAdapter,
  SesameSessionDecryptionResult,
  SesameSessionEncryptionResult,
} from '@/sesame/types/sesameSessionAdapter'
import type { SesameSessionRecord } from '@/sesame/types/sesameTypes'

import type { DirectMessageEncryptedMessage } from './types/DirectMessageEncryptedMessage'
import type { DirectMessageInitiationData } from './types/DirectMessageInitiationData'
import type { DirectMessagePreKeyBundle } from './types/DirectMessagePreKeyBundle'
import type { DirectMessageSessionAdapterDependencies } from './types/DirectMessageSessionAdapterDependencies'
import { DirectMessageSessionError } from './types/DirectMessageSessionError'
import type { DirectMessageSessionState } from './types/DirectMessageSessionState'

const X25519_PUBLIC_KEY_LENGTH = 32
const ED25519_PUBLIC_KEY_LENGTH = 32

export class DirectMessageSessionAdapter
  implements SesameSessionAdapter<DirectMessageSessionState, DirectMessageInitiationData, DirectMessageEncryptedMessage>
{
  private readonly createSessionId: () => string

  constructor(private readonly dependencies: DirectMessageSessionAdapterDependencies) {
    this.createSessionId = dependencies.createSessionId ?? (() => globalThis.crypto.randomUUID())
  }

  async createInitiatingSession(
    remoteDevice: SesameRemoteDevice
  ): Promise<SesameCreatedInitiatingSession<DirectMessageSessionState, DirectMessageInitiationData>> {
    const bundle = await this.dependencies.loadPreKeyBundle(remoteDevice)
    validatePreKeyBundle(remoteDevice, bundle)

    const [counterpartIdentityKey, counterpartSigningKey, counterpartSignedPreKey] = await Promise.all([
      importX25519PublicKey<CounterpartIdentityX25519PublicKey>(bundle.identityX25519PublicKey),
      importEd25519PublicKey(bundle.identityEd25519PublicKey),
      importX25519PublicKey<CounterpartSpkX25519PublicKey>(bundle.signedPreKeyPublicKey),
    ])
    const signedMaterial = await encodeCounterpartMaterialForX3DHPreKeySignatureCheck({
      userId: remoteDevice.userId,
      identityX25519PublicKey: counterpartIdentityKey,
      spkX25519PublicKey: counterpartSignedPreKey,
    })
    const validSignature = await verifyCounterpartEd25519Signature(counterpartSigningKey, signedMaterial, bundle.signedPreKeySignature)

    if (!validSignature) {
      throw new DirectMessageSessionError('The remote signed pre-key signature is invalid')
    }

    const ephemeralKeyPair = await generateEphemeralX25519KeyPair()
    const counterpartOneTimePreKey = bundle.oneTimePreKeyPublicKey
      ? await importX25519PublicKey<CounterpartOtpkX25519PublicKey>(bundle.oneTimePreKeyPublicKey)
      : undefined
    const sharedSecret = await calculateX3DHSharedSecretAsInitiator({
      identityX25519SecretKey: this.dependencies.localIdentity.identityX25519SecretKey,
      ephemeralX25519SecretKey: ephemeralKeyPair.secretKey,
      counterpartIdentityX25519PublicKey: counterpartIdentityKey,
      counterpartSpkX25519PublicKey: counterpartSignedPreKey,
      counterpartOtpkX25519PublicKey: counterpartOneTimePreKey,
    })

    try {
      const ratchetState = await initializeDoubleRatchetAsInitiator({
        sharedSecret,
        receiverInitialRatchetPublicKey: counterpartSignedPreKey,
      })

      return {
        sessionId: this.createSessionId(),
        state: { ratchetState, skippedMessageKeys: new Map() },
        initiationData: {
          receiverSignedPreKeyId: bundle.signedPreKeyId,
          receiverOneTimePreKeyId: bundle.oneTimePreKeyId,
          senderEphemeralKey: await exportPublicKey(ephemeralKeyPair.publicKey),
        },
      }
    } finally {
      sharedSecret.fill(0)
    }
  }

  async createReceivingSession(
    remoteDevice: SesameRemoteDevice,
    encryptedMessage: DirectMessageEncryptedMessage
  ): Promise<SesameCreatedReceivingSession<DirectMessageSessionState>> {
    const initiation = requireInitiationData(encryptedMessage)
    const signedPreKey = await this.dependencies.localKeySource.getSignedPreKey(initiation.receiverSignedPreKeyId)
    if (signedPreKey === null) {
      throw new DirectMessageSessionError('The referenced local signed pre-key is unavailable')
    }

    const oneTimePreKey = initiation.receiverOneTimePreKeyId
      ? await this.dependencies.localKeySource.getOneTimePreKey(initiation.receiverOneTimePreKeyId)
      : null
    if (initiation.receiverOneTimePreKeyId !== null && oneTimePreKey === null) {
      throw new DirectMessageSessionError('The referenced local one-time pre-key is unavailable')
    }

    const [counterpartIdentityKey, counterpartEphemeralKey] = await Promise.all([
      importX25519PublicKey<CounterpartIdentityX25519PublicKey>(remoteDevice.identity.x25519PublicKey),
      importX25519PublicKey<CounterpartEphemeralX25519PublicKey>(initiation.senderEphemeralKey),
    ])
    const sharedSecret = await calculateX3DHSharedSecretAsReceiver({
      identityX25519SecretKey: this.dependencies.localIdentity.identityX25519SecretKey,
      spkX25519SecretKey: signedPreKey.secretKey,
      otpkX25519SecretKey: oneTimePreKey?.secretKey,
      counterpartIdentityX25519PublicKey: counterpartIdentityKey,
      counterpartEphemeralX25519PublicKey: counterpartEphemeralKey,
    })

    try {
      return {
        sessionId: this.createSessionId(),
        state: {
          ratchetState: await initializeDoubleRatchetAsReceiver({
            sharedSecret,
            receiverInitialRatchetKeyPair: {
              secretKey: signedPreKey.secretKey,
              publicKey: signedPreKey.publicKey,
            },
          }),
          skippedMessageKeys: new Map(),
        },
      }
    } finally {
      sharedSecret.fill(0)
    }
  }

  async encrypt(
    remoteDevice: SesameRemoteDevice,
    session: SesameSessionRecord<DirectMessageSessionState, DirectMessageInitiationData>,
    plaintext: Uint8Array<ArrayBuffer>
  ): Promise<SesameSessionEncryptionResult<DirectMessageSessionState, DirectMessageEncryptedMessage>> {
    if (session.state.ratchetState.sendingChainKey === null) {
      throw new DirectMessageSessionError('The Double Ratchet session cannot encrypt yet')
    }

    const encrypted = await encryptMessage({
      state: session.state.ratchetState,
      plaintext,
      associatedData: this.createAssociatedDataForSending(remoteDevice),
    })
    const initiationData = session.phase === 'initiating' ? session.initiationData : null

    if (session.phase === 'initiating' && initiationData === null) {
      throw new DirectMessageSessionError('An initiating session is missing X3DH metadata')
    }

    return {
      encryptedMessage: {
        receiverSignedPreKeyId: initiationData?.receiverSignedPreKeyId ?? null,
        receiverOneTimePreKeyId: initiationData?.receiverOneTimePreKeyId ?? null,
        senderEphemeralKey: initiationData?.senderEphemeralKey ?? null,
        encryptedHeader: encrypted.encryptedMessage.encodedHeader,
        cipherPayload: encrypted.encryptedMessage.cipherText,
      },
      nextSessionState: {
        ratchetState: encrypted.nextState,
        skippedMessageKeys: session.state.skippedMessageKeys,
      },
    }
  }

  async tryDecrypt(
    remoteDevice: SesameRemoteDevice,
    session: SesameSessionRecord<DirectMessageSessionState, DirectMessageInitiationData>,
    encryptedMessage: DirectMessageEncryptedMessage
  ): Promise<SesameSessionDecryptionResult<DirectMessageSessionState> | null> {
    try {
      const decrypted = await decryptMessage({
        state: session.state.ratchetState,
        encryptedMessage: {
          encodedHeader: encryptedMessage.encryptedHeader,
          cipherText: encryptedMessage.cipherPayload,
        },
        associatedData: this.createAssociatedDataForReceiving(remoteDevice),
        skippedMessageKeys: session.state.skippedMessageKeys,
      })

      return {
        plaintext: decrypted.plaintext,
        nextSessionState: {
          ratchetState: decrypted.stateChange.nextCoreState,
          skippedMessageKeys: applySkippedMessageKeyChanges(session.state.skippedMessageKeys, decrypted.stateChange.skippedMessageKeys),
        },
      }
    } catch (error: unknown) {
      if (error instanceof DoubleRatchetAuthenticationError || error instanceof DoubleRatchetStaleMessageError) {
        return null
      }
      throw error
    }
  }

  isInitiationMessage(encryptedMessage: DirectMessageEncryptedMessage): boolean {
    return (
      encryptedMessage.receiverSignedPreKeyId !== null ||
      encryptedMessage.receiverOneTimePreKeyId !== null ||
      encryptedMessage.senderEphemeralKey !== null
    )
  }

  private createAssociatedDataForSending(remoteDevice: SesameRemoteDevice): Uint8Array<ArrayBuffer> {
    return concatBytes([this.dependencies.localIdentity.identityX25519PublicKeyBytes, remoteDevice.identity.x25519PublicKey])
  }

  private createAssociatedDataForReceiving(remoteDevice: SesameRemoteDevice): Uint8Array<ArrayBuffer> {
    return concatBytes([remoteDevice.identity.x25519PublicKey, this.dependencies.localIdentity.identityX25519PublicKeyBytes])
  }
}

function validatePreKeyBundle(remoteDevice: SesameRemoteDevice, bundle: DirectMessagePreKeyBundle): void {
  if (bundle.userId !== remoteDevice.userId || bundle.deviceId !== remoteDevice.deviceId) {
    throw new DirectMessageSessionError('The pre-key bundle belongs to another device')
  }
  if (
    !equalBytes(bundle.identityX25519PublicKey, remoteDevice.identity.x25519PublicKey) ||
    !equalBytes(bundle.identityEd25519PublicKey, remoteDevice.identity.ed25519PublicKey)
  ) {
    throw new DirectMessageSessionError('The pre-key bundle identity does not match Sesame state')
  }
  if ((bundle.oneTimePreKeyId === null) !== (bundle.oneTimePreKeyPublicKey === null)) {
    throw new DirectMessageSessionError('The one-time pre-key bundle fields are inconsistent')
  }
}

function requireInitiationData(encryptedMessage: DirectMessageEncryptedMessage): DirectMessageInitiationData {
  if (encryptedMessage.receiverSignedPreKeyId === null || encryptedMessage.senderEphemeralKey === null) {
    throw new DirectMessageSessionError('The X3DH initiation metadata is incomplete')
  }
  return {
    receiverSignedPreKeyId: encryptedMessage.receiverSignedPreKeyId,
    receiverOneTimePreKeyId: encryptedMessage.receiverOneTimePreKeyId,
    senderEphemeralKey: encryptedMessage.senderEphemeralKey,
  }
}

async function importX25519PublicKey<Key extends CryptoKey>(bytes: Uint8Array<ArrayBuffer>): Promise<Key> {
  validateKeyLength(bytes, X25519_PUBLIC_KEY_LENGTH, 'X25519 public key')
  return (await globalThis.crypto.subtle.importKey('raw', bytes, { name: 'X25519' }, true, [])) as Key
}

async function importEd25519PublicKey(bytes: Uint8Array<ArrayBuffer>): Promise<CounterpartIdentityEd25519PublicKey> {
  validateKeyLength(bytes, ED25519_PUBLIC_KEY_LENGTH, 'Ed25519 public key')
  return (await globalThis.crypto.subtle.importKey('raw', bytes, { name: 'Ed25519' }, false, ['verify'])) as CounterpartIdentityEd25519PublicKey
}

async function exportPublicKey(publicKey: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', publicKey))
}

function applySkippedMessageKeyChanges(
  current: ReadonlyMap<DoubleRatchetSkippedMessageKeyId, SkippedDoubleRatchetMessageKey>,
  changes: DoubleRatchetSkippedMessageKeyChanges
): ReadonlyMap<DoubleRatchetSkippedMessageKeyId, SkippedDoubleRatchetMessageKey> {
  if (changes.added.length === 0 && changes.consumed === null) return current

  const next = new Map(current)
  if (changes.consumed !== null) next.delete(changes.consumed)
  for (const added of changes.added) next.set(added.id, added)
  return next
}

function validateKeyLength(bytes: Uint8Array, expected: number, name: string): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== expected) {
    throw new DirectMessageSessionError(`${name} must be ${expected} bytes`)
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
}
