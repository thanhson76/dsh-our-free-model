/** Synchronous visual token estimate across host versions; not a vendor bill or cap. */
export declare const FALLBACK_IMAGE_PRICING: Readonly<{
  priceImages(images: readonly { offloaded?: boolean }[]): {
    visualTokens: number
    text: string
  }[]
}>
