export interface ParsedHeader {
  dhKeyPublic: Uint8Array<ArrayBuffer>
  previousChainLength: number
  messageNumber: number
}
