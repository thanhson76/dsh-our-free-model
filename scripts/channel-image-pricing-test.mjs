import assert from 'node:assert/strict'
import { LlmAdapter } from './lib/channel-pack-kernel.mjs'

/** Behaviour of the actually published channel pack when pricing is missing, inherited from the default, or already provided by the vendor. */
export function verifyChannelImagePricing(adapters) {
  const images = [{ type: 'image', attachment: {} }, { type: 'image', attachment: {}, offloaded: true }]
  for (const [provider, adapter] of adapters) {
    const pricing = adapter.imageRequestPricing(provider, 'deepseek-v4.1-flash')
    assert.equal(typeof pricing?.priceImages, 'function', `${provider} must synchronously provide a pricing function`)
    assert.equal(typeof pricing.then, 'undefined')
    assert.deepEqual(pricing.priceImages(images), [
      { visualTokens: 1024, text: '[image]' }, { visualTokens: 0, text: '[image omitted]' },
    ])
    assert.deepEqual(pricing.priceImages([]), [])
    const repeated = pricing.priceImages([images[0], images[0]])
    assert.equal(repeated.length, 2, 'multiple occurrences of the same image must each be priced separately')
    repeated[0].visualTokens = 1
    assert.equal(pricing.priceImages([images[0]])[0].visualTokens, 1024, 'caller mutations of a result must not pollute later budgets')
  }
  const original = Object.getOwnPropertyDescriptor(LlmAdapter.prototype, 'imageRequestPricing')
  try {
    LlmAdapter.prototype.imageRequestPricing = () => undefined
    assert.equal(adapters.get('lobsterai').imageRequestPricing('lobsterai', 'model').priceImages(images).length, 2,
      'even when the host default method returns undefined, a fallback must apply')
    const native = { priceImages: () => [{ visualTokens: 2345, text: 'native' }] }
    LlmAdapter.prototype.imageRequestPricing = function (provider, model) {
      assert.equal(provider, 'lobsterai'); assert.equal(model, 'native-model')
      assert.ok(this instanceof LlmAdapter)
      assert.notEqual(this, adapters.get('lobsterai'), 'the vendor method must be bound to the original object')
      return native
    }
    assert.equal(adapters.get('lobsterai').imageRequestPricing('lobsterai', 'native-model'), native,
      'an existing vendor pricing function must be kept as-is')
    LlmAdapter.prototype.imageRequestPricing = () => { throw new Error('native-pricing-error') }
    assert.throws(() => adapters.get('lobsterai').imageRequestPricing('lobsterai', 'model'), /native-pricing-error/,
      'a real exception from the vendor implementation must not be swallowed')
  } finally {
    if (original) Object.defineProperty(LlmAdapter.prototype, 'imageRequestPricing', original)
    else delete LlmAdapter.prototype.imageRequestPricing
  }
}
