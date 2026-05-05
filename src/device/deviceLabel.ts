export interface DeviceLabelInput {
  userAgent?: string
  userAgentData?: unknown
}

export function getDeviceLabel(input?: DeviceLabelInput): string {
  // navigator is typed in the DOM, but userAgentData isn't fully standard yet.
  const ua = input?.userAgent ?? navigator.userAgent
  const nav = navigator as unknown as Record<string, unknown>
  const uad = input?.userAgentData ?? nav.userAgentData

  const browser = detectBrowser(ua, uad)
  const platform = detectPlatform(ua, uad)

  return `${browser} on ${platform}`
}

function detectBrowser(ua: string, uad?: unknown): string {
  if (typeof uad === 'object' && uad !== null) {
    const uadRecord = uad as Record<string, unknown>

    if (Array.isArray(uadRecord.brands)) {
      const validBrands = uadRecord.brands
        .map((b: unknown) => {
          if (typeof b === 'object' && b !== null) {
            const bRecord = b as Record<string, unknown>
            return typeof bRecord.brand === 'string' ? bRecord.brand : ''
          }
          return ''
        })
        .filter(
          (brand: string) => brand && !/Not(?:A|\s)Brand/i.test(brand) && brand !== 'Chromium',
        )
        .join(' ')

      if (/Edge/i.test(validBrands)) return 'Edge'
      if (/Opera|OPR/i.test(validBrands)) return 'Opera'
      if (/Chrome/i.test(validBrands)) return 'Chrome'
      if (/Firefox/i.test(validBrands)) return 'Firefox'
      if (/Safari/i.test(validBrands)) return 'Safari'
    }
  }

  // Fallback to traditional UA string parsing
  if (/Edg/i.test(ua)) return 'Edge'
  if (/OPR|Opera/i.test(ua)) return 'Opera'
  if (/Chrome|CriOS/i.test(ua)) return 'Chrome'
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox'
  if (/Safari/i.test(ua)) return 'Safari'

  return 'Browser'
}

function detectPlatform(ua: string, uad?: unknown): string {
  if (typeof uad === 'object' && uad !== null) {
    const uadRecord = uad as Record<string, unknown>

    if (typeof uadRecord.platform === 'string') {
      const p = uadRecord.platform

      // Ignore generic 'iOS' from Client Hints so we can extract exact iPhone/iPad from the UA string
      if (p && p !== 'Unknown' && p.toLowerCase() !== 'ios') {
        if (/windows/i.test(p)) return 'Windows'
        if (/macOS/i.test(p)) return 'macOS'
        if (/android/i.test(p)) return 'Android'
        if (/linux/i.test(p)) return 'Linux'
        return p
      }
    }
  }

  // Fallback parsing (strict order guarantees Mac/Linux aren't matched inside mobile strings)
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'

  return 'Unknown platform'
}
