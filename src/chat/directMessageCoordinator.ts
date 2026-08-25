import { chatApi } from '@/chat/api/chatApi'
import type { InitDeviceKeyBundle } from '@/chat/types/key-bundle/InitKeyBundleResponse'
import { useDbStore } from '@/db/dbStore'
import type { RunarDb } from '@/db/RunarDB'
import { useDeviceStore } from '@/device/deviceStore'
import { LocalDeviceRepository } from '@/device/LocalDeviceRepository'
import type { LocalDeviceKeyMaterial } from '@/device/types/localDeviceTypes'
import { DirectMessageCoordinator } from '@/sesame/direct-message/DirectMessageCoordinator'
import { DirectMessageSessionAdapter } from '@/sesame/direct-message/DirectMessageSessionAdapter'
import { DirectMessageSessionPersistence } from '@/sesame/direct-message/DirectMessageSessionPersistence'
import { DirectMessageSessionError } from '@/sesame/direct-message/directMessageErrors'

import { DirectMessageSendingService } from './DirectMessageSendingService'
import { directMessagePreKeyBundleFromApi } from './directMessageTransport'

const MAX_DEVICES_PER_USER = 5
const MAX_SESSIONS_PER_DEVICE = 5

let coordinatorsByDatabase = new WeakMap<RunarDb, Map<string, DirectMessageCoordinator>>()
let sendingServicesByCoordinator = new WeakMap<DirectMessageCoordinator, DirectMessageSendingService>()

export function getDirectMessageCoordinator(): DirectMessageCoordinator {
  const dbStore = useDbStore()
  const deviceStore = useDeviceStore()
  const keyMaterial = deviceStore.localDevice

  if (dbStore.dbStatus !== 'ready' || !keyMaterial || !deviceStore.applicationReady) {
    throw new DirectMessageSessionError('The local device is not ready for direct messaging')
  }

  const db = dbStore.db
  const deviceId = keyMaterial.device.deviceId
  const existing = coordinatorsByDatabase.get(db)?.get(deviceId)
  if (existing) return existing

  const coordinator = createDirectMessageCoordinator(db, keyMaterial)
  const databaseCoordinators = coordinatorsByDatabase.get(db) ?? new Map()
  databaseCoordinators.set(deviceId, coordinator)
  coordinatorsByDatabase.set(db, databaseCoordinators)
  return coordinator
}

export function getDirectMessageSendingService(): DirectMessageSendingService {
  const coordinator = getDirectMessageCoordinator()
  const existing = sendingServicesByCoordinator.get(coordinator)
  if (existing) return existing

  const sendingService = new DirectMessageSendingService(coordinator, (payload) => chatApi.postSendMessagePayload(payload))
  sendingServicesByCoordinator.set(coordinator, sendingService)
  return sendingService
}

export function clearDirectMessageCoordinator(): void {
  coordinatorsByDatabase = new WeakMap()
  sendingServicesByCoordinator = new WeakMap()
}

function createDirectMessageCoordinator(db: RunarDb, keyMaterial: LocalDeviceKeyMaterial): DirectMessageCoordinator {
  const localDeviceRepository = new LocalDeviceRepository(db)
  const adapter = new DirectMessageSessionAdapter({
    localIdentity: {
      userId: keyMaterial.device.userId,
      deviceId: keyMaterial.device.deviceId,
      identityX25519SecretKey: keyMaterial.device.identityX25519.secretKey,
      identityX25519PublicKey: keyMaterial.device.identityX25519.publicKey,
      identityX25519PublicKeyBytes: keyMaterial.device.identityX25519PublicKeyBytes,
    },
    localKeySource: {
      async getSignedPreKey(id) {
        const key = await localDeviceRepository.getSignedPreKey(id)
        return key ? { id: key.id, secretKey: key.keyPair.secretKey, publicKey: key.keyPair.publicKey } : null
      },
      async getOneTimePreKey(id) {
        const key = await localDeviceRepository.getOneTimePreKey(id)
        return key ? { id: key.id, secretKey: key.keyPair.secretKey } : null
      },
    },
    async loadPreKeyBundle(remoteDevice) {
      const bundlesByUser = await chatApi.getKeyBundles({
        [remoteDevice.userId]: [remoteDevice.deviceId],
      })
      const bundle: InitDeviceKeyBundle | undefined = bundlesByUser
        .get(remoteDevice.userId)
        ?.find((candidate) => candidate.deviceId === remoteDevice.deviceId)
      if (!bundle) {
        throw new DirectMessageSessionError(`No pre-key bundle returned for device ${remoteDevice.deviceId}`)
      }
      return directMessagePreKeyBundleFromApi(remoteDevice.userId, bundle)
    },
  })

  return new DirectMessageCoordinator({
    persistence: new DirectMessageSessionPersistence(db),
    sessionAdapter: adapter,
    loadDeviceIdentities: (userId) => chatApi.getIdentityKeys(userId),
    localAddress: {
      userId: keyMaterial.device.userId,
      deviceId: keyMaterial.device.deviceId,
    },
    limits: {
      maxDevicesPerUser: MAX_DEVICES_PER_USER,
      maxSessionsPerDevice: MAX_SESSIONS_PER_DEVICE,
    },
  })
}
