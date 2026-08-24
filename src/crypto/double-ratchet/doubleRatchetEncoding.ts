import type {
  DoubleRatchetHeader,
  DoubleRatchetPublicKeyBytes,
  EncodedDoubleRatchetHeader,
} from './doubleRatchetTypes'

const X25519_PUBLIC_KEY_LENGTH = 32
const COUNTER_LENGTH = 4
const DOUBLE_RATCHET_HEADER_LENGTH = X25519_PUBLIC_KEY_LENGTH + COUNTER_LENGTH * 2
const MAX_UINT32 = 0xffffffff

export function encodeDoubleRatchetHeader(header: DoubleRatchetHeader): EncodedDoubleRatchetHeader {
  validatePublicKey(header.ratchetPublicKey)
  validateCounter(header.previousChainLength, 'Previous chain length')
  validateCounter(header.messageNumber, 'Message number')

  const encodedHeader = new Uint8Array(DOUBLE_RATCHET_HEADER_LENGTH)
  encodedHeader.set(header.ratchetPublicKey)

  const view = new DataView(encodedHeader.buffer)
  view.setUint32(X25519_PUBLIC_KEY_LENGTH, header.previousChainLength, false)
  view.setUint32(X25519_PUBLIC_KEY_LENGTH + COUNTER_LENGTH, header.messageNumber, false)

  return encodedHeader as EncodedDoubleRatchetHeader
}

export function decodeDoubleRatchetHeader(
  encodedHeader: Uint8Array<ArrayBuffer>,
): DoubleRatchetHeader {
  if (!(encodedHeader instanceof Uint8Array)) {
    throw new TypeError('Encoded Double Ratchet header must be a Uint8Array')
  }

  if (encodedHeader.byteLength !== DOUBLE_RATCHET_HEADER_LENGTH) {
    throw new RangeError(
      `Encoded Double Ratchet header must be ${DOUBLE_RATCHET_HEADER_LENGTH} bytes`,
    )
  }

  const view = new DataView(
    encodedHeader.buffer,
    encodedHeader.byteOffset,
    encodedHeader.byteLength,
  )

  return {
    ratchetPublicKey: encodedHeader.slice(
      0,
      X25519_PUBLIC_KEY_LENGTH,
    ) as DoubleRatchetPublicKeyBytes,
    previousChainLength: view.getUint32(X25519_PUBLIC_KEY_LENGTH, false),
    messageNumber: view.getUint32(X25519_PUBLIC_KEY_LENGTH + COUNTER_LENGTH, false),
  }
}

function validatePublicKey(publicKey: DoubleRatchetPublicKeyBytes): void {
  if (!(publicKey instanceof Uint8Array)) {
    throw new TypeError('Double Ratchet public key must be a Uint8Array')
  }

  if (publicKey.byteLength !== X25519_PUBLIC_KEY_LENGTH) {
    throw new RangeError(`Double Ratchet public key must be ${X25519_PUBLIC_KEY_LENGTH} bytes`)
  }
}

function validateCounter(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer`)
  }
}
