import {
  type ChainKdfResult,
  type DoubleRatchetChainKey,
  type DoubleRatchetInitiatorInitInput,
  type DoubleRatchetInitKeyPair,
  type DoubleRatchetKeyPair,
  type DoubleRatchetMessageKey,
  type DoubleRatchetPublicKeyBytes,
  type DoubleRatchetReceiverInitialState,
  type DoubleRatchetReceiverInitInput,
  type DoubleRatchetRootKey,
  type DoubleRatchetSecretKey,
  type DoubleRatchetSendingInitialState,
  type RootKdfResult,
} from './doubleRatchetTypes'

const X25519_KEY_LENGTH = 32
const ROOT_KDF_INFO = new TextEncoder().encode('runar-chat/double-ratchet/root/v1')
const MESSAGE_KEY_CONSTANT = new Uint8Array([0x01])
const CHAIN_KEY_CONSTANT = new Uint8Array([0x02])

export async function initializeDoubleRatchetAsInitiator(
  input: DoubleRatchetInitiatorInitInput,
): Promise<DoubleRatchetSendingInitialState> {
  validateSharedSecret(input.sharedSecret)
  validateX25519PublicKey(input.receiverInitialRatchetPublicKey)

  const localRatchetKeyPair: DoubleRatchetKeyPair = await generateDoubleRatchetKeyPair()
  const remoteRatchetPublicKey: DoubleRatchetPublicKeyBytes = await exportDoubleRatchetPublicKey(
    input.receiverInitialRatchetPublicKey,
  )

  let dhOutput: Uint8Array<ArrayBuffer> | undefined
  try {
    dhOutput = await calculateDoubleRatchetDH(
      localRatchetKeyPair.secretKey,
      input.receiverInitialRatchetPublicKey,
    )

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
      skippedMessageKeys: [],
    }
  } finally {
    dhOutput?.fill(0)
  }
}

export async function initializeDoubleRatchetAsReceiver(
  input: DoubleRatchetReceiverInitInput,
): Promise<DoubleRatchetReceiverInitialState> {
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
    skippedMessageKeys: [],
  }
}

export async function deriveChainKeys(
  chainKey: DoubleRatchetChainKey,
): Promise<ChainKdfResult> {
  validateKeyLength(chainKey, 'Double Ratchet chain key')

  const hmacKey = await globalThis.crypto.subtle.importKey(
    'raw',
    chainKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const [messageKey, nextChainKey] = await Promise.all([
    globalThis.crypto.subtle.sign('HMAC', hmacKey, MESSAGE_KEY_CONSTANT),
    globalThis.crypto.subtle.sign('HMAC', hmacKey, CHAIN_KEY_CONSTANT),
  ])

  return {
    chainKey: new Uint8Array(nextChainKey) as DoubleRatchetChainKey,
    messageKey: new Uint8Array(messageKey) as DoubleRatchetMessageKey,
  }
}

async function deriveRootAndChainKeys(
  rootKey: Uint8Array<ArrayBuffer>,
  dhOutput: Uint8Array<ArrayBuffer>,
): Promise<RootKdfResult> {
  const hkdfKey = await globalThis.crypto.subtle.importKey('raw', dhOutput, 'HKDF', false, [
    'deriveBits',
  ])

  const derivedBytes = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: rootKey,
        info: ROOT_KDF_INFO,
      },
      hkdfKey,
      X25519_KEY_LENGTH * 2 * 8,
    ),
  )

  return {
    rootKey: derivedBytes.slice(0, X25519_KEY_LENGTH) as DoubleRatchetRootKey,
    chainKey: derivedBytes.slice(X25519_KEY_LENGTH) as DoubleRatchetChainKey,
  }
}

async function generateDoubleRatchetKeyPair(): Promise<DoubleRatchetKeyPair> {
  const keyPair = (await globalThis.crypto.subtle.generateKey({ name: 'X25519' }, false, [
    'deriveBits',
  ])) as CryptoKeyPair

  return {
    secretKey: keyPair.privateKey as DoubleRatchetSecretKey,
    publicKey: await exportDoubleRatchetPublicKey(keyPair.publicKey),
  }
}

async function exportDoubleRatchetPublicKey(
  publicKey: CryptoKey,
): Promise<DoubleRatchetPublicKeyBytes> {
  const encodedPublicKey = new Uint8Array(
    await globalThis.crypto.subtle.exportKey('raw', publicKey),
  )

  if (encodedPublicKey.byteLength !== X25519_KEY_LENGTH) {
    throw new RangeError(`X25519 public key must be ${X25519_KEY_LENGTH} bytes`)
  }

  return encodedPublicKey as DoubleRatchetPublicKeyBytes
}

async function calculateDoubleRatchetDH(
  secretKey: DoubleRatchetSecretKey,
  publicKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  const dhOutput = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'X25519',
      public: publicKey,
    },
    secretKey,
    X25519_KEY_LENGTH * 8,
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
