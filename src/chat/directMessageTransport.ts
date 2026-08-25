import type { InitDeviceKeyBundle } from '@/chat/types/key-bundle/InitKeyBundleResponse'
import type { DeviceMessagePayload } from '@/chat/types/message/MessagePayload'
import { uint8ArrayToBase64 } from '@/core/utils'
import type { DirectMessageEncryptedMessage, DirectMessagePreKeyBundle } from '@/sesame/direct-message/directMessageTypes'
import type { SesameEncryptedDeviceMessage } from '@/sesame/types/sesameTypes'

export function directMessagePreKeyBundleFromApi(userId: string, bundle: InitDeviceKeyBundle): DirectMessagePreKeyBundle {
  return {
    userId,
    deviceId: bundle.deviceId,
    identityX25519PublicKey: bundle.x25519IdentityKey,
    identityEd25519PublicKey: bundle.ed25519IdentityKey,
    signedPreKeyId: bundle.signedPreKeyId,
    signedPreKeyPublicKey: bundle.signedPreKey,
    signedPreKeySignature: bundle.signedPreKeySignature,
    oneTimePreKeyId: bundle.oneTimePreKeyId,
    oneTimePreKeyPublicKey: bundle.oneTimePreKey,
  }
}

export function directMessageToApiPayload(
  receiverUserId: string,
  deviceMessage: SesameEncryptedDeviceMessage<DirectMessageEncryptedMessage>
): DeviceMessagePayload {
  const encrypted = deviceMessage.encryptedMessage
  return {
    receiverUserId,
    receiverDeviceId: deviceMessage.deviceId,
    receiverSignedPreKeyId: encrypted.receiverSignedPreKeyId,
    receiverOneTimePreKeyId: encrypted.receiverOneTimePreKeyId,
    senderEphemeralKey: encrypted.senderEphemeralKey ? uint8ArrayToBase64(encrypted.senderEphemeralKey) : null,
    cipherPayload: uint8ArrayToBase64(encrypted.cipherPayload),
    encryptedHeader: uint8ArrayToBase64(encrypted.encryptedHeader),
  }
}
