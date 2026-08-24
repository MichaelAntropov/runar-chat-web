const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function encodeUint16(value: number): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError('Value must be an unsigned 16-bit integer')
  }

  const encoded: Uint8Array<ArrayBuffer> = new Uint8Array(2)
  new DataView(encoded.buffer).setUint16(0, value, false)

  return encoded
}

export function concatBytes(
  parts: readonly Uint8Array[],
): Uint8Array<ArrayBuffer> {
  const totalLength = parts.reduce(
    (length, part) => length + part.byteLength,
    0,
  )

  if (!Number.isSafeInteger(totalLength)) {
    throw new RangeError('Combined byte length exceeds the safe integer range')
  }

  const result: Uint8Array<ArrayBuffer> = new Uint8Array(totalLength)

  let offset = 0

  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }

  return result
}

export function uuidToBytes(uuid: string): Uint8Array<ArrayBuffer> {
  if (!UUID_PATTERN.test(uuid)) {
    throw new TypeError('Expected a canonical UUID')
  }

  const hexadecimal = uuid.replaceAll('-', '')
  const result: Uint8Array<ArrayBuffer> = new Uint8Array(16)

  for (let index = 0; index < result.length; index++) {
    const byteStart = index * 2
    result[index] = Number.parseInt(
      hexadecimal.slice(byteStart, byteStart + 2),
      16,
    )
  }

  return result
}
