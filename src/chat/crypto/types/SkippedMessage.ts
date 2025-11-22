export class SkippedMessageKey {
  constructor(
    public readonly headerKey: Uint8Array<ArrayBuffer>,
    public readonly messageNumber: number,
    public readonly messageKey: Uint8Array<ArrayBuffer>,
  ) {}
}
