import { argon2id } from 'hash-wasm'

const ARGON2_CONFIG = {
  iterations: 1,
  memorySize: 1048576, // 1048576 - 1 GiB
  parallelism: 1,
  hashLength: 32,
}

export async function deriveKEK(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const result = await argon2id({
    password: password,
    salt: salt,
    ...ARGON2_CONFIG,
    outputType: 'binary',
  })
  return new Uint8Array(result)
}

export async function encryptDEK(dek: Uint8Array<ArrayBuffer>, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const kekBytes = await deriveKEK(password, salt)

  const cryptoKey = await crypto.subtle.importKey('raw', kekBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
  ])

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encryptedDek = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, dek)

  return {
    encryptedDek: new Uint8Array(encryptedDek),
    salt,
    iv,
  }
}

export async function decryptDEK(
  encryptedDek: Uint8Array<ArrayBuffer>,
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iv: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const kekBytes = await deriveKEK(password, salt)

  const cryptoKey = await crypto.subtle.importKey('raw', kekBytes, { name: 'AES-GCM' }, false, [
    'decrypt',
  ])

  const decryptedDek = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encryptedDek)

  return new Uint8Array(decryptedDek)
}
