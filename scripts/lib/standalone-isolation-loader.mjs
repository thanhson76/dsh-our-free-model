const forbidden = [
  new URL('../../index.js', import.meta.url).href,
  new URL('../../adapter/kernel.js', import.meta.url).href,
  new URL('../../vendor/channel-pack/pack.js', import.meta.url).href,
]

/** Process-level verification of the standalone entry: touching the plugin entry or a host module fails immediately. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@deepseek-ai/')) throw new Error(`standalone imported a DSH dependency: ${specifier}`)
  const result = await nextResolve(specifier, context)
  if (forbidden.includes(result.url)) throw new Error(`standalone imported a host-only module: ${result.url}`)
  return result
}
