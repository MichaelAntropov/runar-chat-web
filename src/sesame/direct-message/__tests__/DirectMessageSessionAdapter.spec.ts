import { describe, expect, it, vi } from 'vitest'

import type { InitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dhTypes'
import { generateInitialDeviceKeyMaterial } from '@/crypto/x3dh/x3dh'
import type { SesameRemoteDevice, SesameSessionRecord } from '@/sesame/types/sesameTypes'

import { DirectMessageSessionAdapter } from '../DirectMessageSessionAdapter'
import { DirectMessageSessionError } from '../directMessageErrors'
import type {
  DirectMessageEncryptedMessage,
  DirectMessageInitiationData,
  DirectMessageLocalIdentity,
  DirectMessageLocalKeySource,
  DirectMessagePreKeyBundle,
  DirectMessageSessionState,
} from '../directMessageTypes'

const ALICE_USER_ID = '11111111-1111-4111-8111-111111111111'
const ALICE_DEVICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB_USER_ID = '22222222-2222-4222-8222-222222222222'
const BOB_DEVICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const BOB_SIGNED_PRE_KEY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const BOB_ONE_TIME_PRE_KEY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

describe('DirectMessageSessionAdapter', () => {
  it('establishes an X3DH session and exchanges Double Ratchet messages', async () => {
    const [aliceKeys, bobKeys] = await Promise.all([
      generateInitialDeviceKeyMaterial({ userId: ALICE_USER_ID, oneTimePreKeyCount: 0 }),
      generateInitialDeviceKeyMaterial({ userId: BOB_USER_ID, oneTimePreKeyCount: 1 }),
    ])
    const [aliceRemote, bobRemote, bobBundle] = await Promise.all([
      toRemoteDevice(BOB_USER_ID, BOB_DEVICE_ID, bobKeys),
      toRemoteDevice(ALICE_USER_ID, ALICE_DEVICE_ID, aliceKeys),
      toPreKeyBundle(bobKeys),
    ])
    const getBobOneTimePreKey = vi.fn(async () => ({
      id: BOB_ONE_TIME_PRE_KEY_ID,
      secretKey: bobKeys.oneTimePreKeys[0]!.secretKey,
    }))
    const aliceAdapter = new DirectMessageSessionAdapter({
      localIdentity: await toLocalIdentity(ALICE_USER_ID, ALICE_DEVICE_ID, aliceKeys),
      localKeySource: emptyLocalKeySource(),
      loadPreKeyBundle: async () => bobBundle,
      createSessionId: () => 'alice-session',
    })
    const bobAdapter = new DirectMessageSessionAdapter({
      localIdentity: await toLocalIdentity(BOB_USER_ID, BOB_DEVICE_ID, bobKeys),
      localKeySource: {
        getSignedPreKey: async () => ({
          id: BOB_SIGNED_PRE_KEY_ID,
          secretKey: bobKeys.signedPreKey.keyPair.secretKey,
          publicKey: bobKeys.signedPreKey.keyPair.publicKey,
        }),
        getOneTimePreKey: getBobOneTimePreKey,
      },
      loadPreKeyBundle: async () => {
        throw new Error('Bob does not initiate in this test')
      },
      createSessionId: () => 'bob-session',
    })

    const initiating = await aliceAdapter.createInitiatingSession(aliceRemote)
    const aliceSession = initiatingSession(initiating)
    const aliceEncryption = await aliceAdapter.encrypt(aliceRemote, aliceSession, encodeText('hello Bob'))
    const receiving = await bobAdapter.createReceivingSession(bobRemote, aliceEncryption.encryptedMessage)
    const bobDecryption = await bobAdapter.tryDecrypt(
      bobRemote,
      regularSession(receiving.sessionId, receiving.state),
      aliceEncryption.encryptedMessage
    )

    expect(decodeText(bobDecryption!.plaintext)).toBe('hello Bob')
    expect(getBobOneTimePreKey).toHaveBeenCalledWith(BOB_ONE_TIME_PRE_KEY_ID)
    expect(aliceEncryption.encryptedMessage).toMatchObject({
      receiverSignedPreKeyId: BOB_SIGNED_PRE_KEY_ID,
      receiverOneTimePreKeyId: BOB_ONE_TIME_PRE_KEY_ID,
    })

    const bobEncryption = await bobAdapter.encrypt(
      bobRemote,
      regularSession(receiving.sessionId, bobDecryption!.nextSessionState),
      encodeText('hello Alice')
    )
    const aliceDecryption = await aliceAdapter.tryDecrypt(
      aliceRemote,
      initiatingSession({
        ...initiating,
        state: aliceEncryption.nextSessionState,
      }),
      bobEncryption.encryptedMessage
    )

    expect(decodeText(aliceDecryption!.plaintext)).toBe('hello Alice')
    expect(bobEncryption.encryptedMessage.receiverSignedPreKeyId).toBeNull()
    expect(bobEncryption.encryptedMessage.receiverOneTimePreKeyId).toBeNull()
    expect(bobEncryption.encryptedMessage.senderEphemeralKey).toBeNull()
  })

  it('rejects a pre-key bundle whose signature is invalid', async () => {
    const [aliceKeys, bobKeys] = await Promise.all([
      generateInitialDeviceKeyMaterial({ userId: ALICE_USER_ID, oneTimePreKeyCount: 0 }),
      generateInitialDeviceKeyMaterial({ userId: BOB_USER_ID, oneTimePreKeyCount: 0 }),
    ])
    const remote = await toRemoteDevice(BOB_USER_ID, BOB_DEVICE_ID, bobKeys)
    const bundle = await toPreKeyBundle(bobKeys)
    bundle.signedPreKeySignature[0] ^= 0x01
    const adapter = new DirectMessageSessionAdapter({
      localIdentity: await toLocalIdentity(ALICE_USER_ID, ALICE_DEVICE_ID, aliceKeys),
      localKeySource: emptyLocalKeySource(),
      loadPreKeyBundle: async () => bundle,
    })

    await expect(adapter.createInitiatingSession(remote)).rejects.toThrow(DirectMessageSessionError)
  })

  it('rejects incomplete initiation metadata', async () => {
    const bobKeys = await generateInitialDeviceKeyMaterial({
      userId: BOB_USER_ID,
      oneTimePreKeyCount: 0,
    })
    const adapter = new DirectMessageSessionAdapter({
      localIdentity: await toLocalIdentity(BOB_USER_ID, BOB_DEVICE_ID, bobKeys),
      localKeySource: emptyLocalKeySource(),
      loadPreKeyBundle: async () => {
        throw new Error('Unused')
      },
    })
    const malformed = {
      receiverSignedPreKeyId: BOB_SIGNED_PRE_KEY_ID,
      receiverOneTimePreKeyId: null,
      senderEphemeralKey: null,
      encryptedHeader: new Uint8Array(),
      cipherPayload: new Uint8Array(),
    } as DirectMessageEncryptedMessage

    expect(adapter.isInitiationMessage(malformed)).toBe(true)
    await expect(adapter.createReceivingSession(await toRemoteDevice(ALICE_USER_ID, ALICE_DEVICE_ID, bobKeys), malformed)).rejects.toThrow(
      'The X3DH initiation metadata is incomplete'
    )
  })
})

function initiatingSession(created: {
  sessionId: string
  state: DirectMessageSessionState
  initiationData: DirectMessageInitiationData
}): SesameSessionRecord<DirectMessageSessionState, DirectMessageInitiationData> {
  return {
    ...created,
    phase: 'initiating',
    createdAt: 1,
    lastUsedAt: 1,
  }
}

function regularSession(
  sessionId: string,
  state: DirectMessageSessionState
): SesameSessionRecord<DirectMessageSessionState, DirectMessageInitiationData> {
  return {
    sessionId,
    phase: 'regular',
    state,
    initiationData: null,
    createdAt: 1,
    lastUsedAt: 1,
  }
}

async function toLocalIdentity(userId: string, deviceId: string, material: InitialDeviceKeyMaterial): Promise<DirectMessageLocalIdentity> {
  return {
    userId,
    deviceId,
    identityX25519SecretKey: material.identityX25519.secretKey,
    identityX25519PublicKey: material.identityX25519.publicKey,
    identityX25519PublicKeyBytes: await exportPublicKey(material.identityX25519.publicKey),
  }
}

async function toRemoteDevice(userId: string, deviceId: string, material: InitialDeviceKeyMaterial): Promise<SesameRemoteDevice> {
  return {
    userId,
    deviceId,
    identity: {
      x25519PublicKey: await exportPublicKey(material.identityX25519.publicKey),
      ed25519PublicKey: await exportPublicKey(material.identityEd25519.publicKey),
    },
  }
}

async function toPreKeyBundle(material: InitialDeviceKeyMaterial): Promise<DirectMessagePreKeyBundle> {
  const oneTimePreKey = material.oneTimePreKeys[0] ?? null
  return {
    userId: BOB_USER_ID,
    deviceId: BOB_DEVICE_ID,
    identityX25519PublicKey: await exportPublicKey(material.identityX25519.publicKey),
    identityEd25519PublicKey: await exportPublicKey(material.identityEd25519.publicKey),
    signedPreKeyId: BOB_SIGNED_PRE_KEY_ID,
    signedPreKeyPublicKey: await exportPublicKey(material.signedPreKey.keyPair.publicKey),
    signedPreKeySignature: material.signedPreKey.signature.slice(),
    oneTimePreKeyId: oneTimePreKey ? BOB_ONE_TIME_PRE_KEY_ID : null,
    oneTimePreKeyPublicKey: oneTimePreKey ? await exportPublicKey(oneTimePreKey.publicKey) : null,
  }
}

function emptyLocalKeySource(): DirectMessageLocalKeySource {
  return {
    getSignedPreKey: async () => null,
    getOneTimePreKey: async () => null,
  }
}

async function exportPublicKey(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key))
}

function encodeText(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(new TextEncoder().encode(value))
}

function decodeText(value: Uint8Array<ArrayBuffer>): string {
  return new TextDecoder().decode(value)
}
