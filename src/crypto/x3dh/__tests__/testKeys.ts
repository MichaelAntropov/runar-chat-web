export function asCounterpartKey<Key extends CryptoKey>(key: CryptoKey): Key {
  return key as Key
}
