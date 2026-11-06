/**
 * Synchronous estimate used when a vendor's visual pricing protocol is missing, for the host's token budget and for persisting results.
 * 1024 is a fallback estimate; it does not represent any vendor's actual consumption or cap. Images already removed from the request count only their description text.
 */
export const FALLBACK_IMAGE_PRICING = Object.freeze({
  /** @param {readonly { offloaded?: boolean }[]} images */
  priceImages(images) {
    return images.map(image => image.offloaded === true
      ? { visualTokens: 0, text: '[image omitted]' }
      : { visualTokens: 1024, text: '[image]' })
  },
})
