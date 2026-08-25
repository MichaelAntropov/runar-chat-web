import type {
  DoubleRatchetCipherText,
  DoubleRatchetSkippedMessageKeys,
  DoubleRatchetState,
  EncodedDoubleRatchetHeader,
} from '@/crypto/double-ratchet/doubleRatchetTypes'
import type {
  IdentityX25519PublicKey,
  IdentityX25519SecretKey,
  OtpkX25519SecretKey,
  SpkX25519PublicKey,
  SpkX25519SecretKey,
} from '@/crypto/keys/keyTypes'
import type {
  SesameDeviceIdentityTuple,
  SesameDeviceSetChange,
  SesameEncryptedDeviceMessage,
  SesameLimits,
  SesameLocalAddress,
  SesameRemoteDevice,
  SesameSessionAdapter,
  SesameUserProjection,
  SesameUserRecord,
} from '@/sesame/types/sesameTypes'

export interface DirectMessageSessionState {
  readonly ratchetState: DoubleRatchetState
  readonly skippedMessageKeys: DoubleRatchetSkippedMessageKeys
}

export interface DirectMessageInitiationData {
  readonly receiverSignedPreKeyId: string
  readonly receiverOneTimePreKeyId: string | null
  readonly senderEphemeralKey: Uint8Array<ArrayBuffer>
}

export interface DirectMessageEncryptedMessage {
  readonly receiverSignedPreKeyId: string | null
  readonly receiverOneTimePreKeyId: string | null
  readonly senderEphemeralKey: Uint8Array<ArrayBuffer> | null
  readonly encryptedHeader: EncodedDoubleRatchetHeader
  readonly cipherPayload: DoubleRatchetCipherText
}

export interface DirectMessagePreKeyBundle {
  readonly userId: string
  readonly deviceId: string
  readonly identityX25519PublicKey: Uint8Array<ArrayBuffer>
  readonly identityEd25519PublicKey: Uint8Array<ArrayBuffer>
  readonly signedPreKeyId: string
  readonly signedPreKeyPublicKey: Uint8Array<ArrayBuffer>
  readonly signedPreKeySignature: Uint8Array<ArrayBuffer>
  readonly oneTimePreKeyId: string | null
  readonly oneTimePreKeyPublicKey: Uint8Array<ArrayBuffer> | null
}

export interface DirectMessageLocalIdentity {
  readonly userId: string
  readonly deviceId: string
  readonly identityX25519SecretKey: IdentityX25519SecretKey
  readonly identityX25519PublicKey: IdentityX25519PublicKey
  readonly identityX25519PublicKeyBytes: Uint8Array<ArrayBuffer>
}

export interface DirectMessageLocalSignedPreKey {
  readonly id: string
  readonly secretKey: SpkX25519SecretKey
  readonly publicKey: SpkX25519PublicKey
}

export interface DirectMessageLocalOneTimePreKey {
  readonly id: string
  readonly secretKey: OtpkX25519SecretKey
}

export interface DirectMessageLocalKeySource {
  getSignedPreKey(id: string): Promise<DirectMessageLocalSignedPreKey | null>
  getOneTimePreKey(id: string): Promise<DirectMessageLocalOneTimePreKey | null>
}

export interface DirectMessageSessionAdapterDependencies {
  readonly localIdentity: DirectMessageLocalIdentity
  readonly localKeySource: DirectMessageLocalKeySource
  readonly loadPreKeyBundle: (remoteDevice: SesameRemoteDevice) => Promise<DirectMessagePreKeyBundle>
  readonly createSessionId?: () => string
}

export interface DirectMessagePersistence {
  loadUserRecord(userId: string): Promise<SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData> | null>

  saveUserRecord(
    previous: SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData> | null,
    nextUserRecord: SesameUserRecord<DirectMessageSessionState, DirectMessageInitiationData>
  ): Promise<SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData>>

  saveReceivedUserRecord(
    previous: SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData> | null,
    nextUserRecord: SesameUserRecord<DirectMessageSessionState, DirectMessageInitiationData>,
    consumedOneTimePreKeyId: string | null
  ): Promise<SesameUserProjection<DirectMessageSessionState, DirectMessageInitiationData>>
}

export interface DirectMessageCoordinatorDependencies {
  readonly persistence: DirectMessagePersistence
  readonly sessionAdapter: SesameSessionAdapter<DirectMessageSessionState, DirectMessageInitiationData, DirectMessageEncryptedMessage>
  readonly loadDeviceIdentities: (userId: string) => Promise<readonly SesameDeviceIdentityTuple[]>
  readonly localAddress: SesameLocalAddress
  readonly limits: SesameLimits
  readonly now?: () => number
}

export interface DirectMessageEncryptionResult {
  readonly deviceMessages: readonly SesameEncryptedDeviceMessage<DirectMessageEncryptedMessage>[]
}

export interface DirectMessageEncryptionOptions {
  readonly allowEmptyDeviceSet?: boolean
}

export interface DirectMessageDecryptionInput {
  readonly senderUserId: string
  readonly senderDeviceId: string
  readonly encryptedMessage: DirectMessageEncryptedMessage
  readonly receivedAt: number
}

export interface DirectMessageDecryptionResult {
  readonly plaintext: Uint8Array<ArrayBuffer>
  readonly sessionId: string
  readonly sessionCreated: boolean
  readonly deviceChange: SesameDeviceSetChange | null
}
