export class SkippedMessageIdentifier {
  constructor(
    public readonly dhPublicKey: Uint8Array<ArrayBuffer>,
    public readonly messageNumber: number,
  ) {}

  equals(other: unknown): boolean {
    if (!(other instanceof SkippedMessageIdentifier)) return false
    return (
      this.messageNumber === other.messageNumber &&
      this.arraysEqual(this.dhPublicKey, other.dhPublicKey)
    )
  }

  arraysEqual(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  uint8ArrayToBase64(uint8Array: Uint8Array<ArrayBuffer>): string {
    let binaryString = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i])
    }
    return btoa(binaryString)
  }

  toKey(): string {
    return `${this.messageNumber}:${this.uint8ArrayToBase64(this.dhPublicKey)}`
  }
}
