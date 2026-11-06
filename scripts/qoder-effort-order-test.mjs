/**
 * Regression test for the **order** of Qoder thinking efforts.
 *
 * Background: the `efforts` in `QODER_CN_FALLBACK_MODELS` record the **key
 * order** of the catalog's `thinking_config.enabled.efforts`, and that is not
 * strength order — `dfmodel`'s real key order is `high / max / low`, and
 * `supportsDisable` appends `none` at the end, so the DSH side got
 * `high → max → low → thinking off`.
 *
 * The official client does not render it that way: in
 * `displayReasoningEfforts()` it **stably sorts** by
 * `REASONING_EFFORT_DISPLAY_ORDER = [none, minimal, low, medium, high, xhigh, max]`
 * (unregistered entries go last), and `EffortControl` and the settings panel
 * only render that result.
 * Evidence: CN 0.4.8 asar `out/renderer/assets/index-DDa3WwIe.js`.
 *
 * The consequence of not sorting is "the further right, the weaker": UIs that
 * depend on "position = strength" (such as the `dsh-codex-effort-slider`
 * slider) would draw `max` to the left of `high`, and draw `thinking off` at
 * the far right lit up at full strength.
 */

const CASES = [
  // [description, input model, expected effort order]
  ['dfmodel real key order (high/max/low + appended none)',
    { efforts: ['high', 'max', 'low'], supportsDisable: true }, ['none', 'low', 'high', 'max']],
  ['dmodel (high/max + appended none)',
    { efforts: ['high', 'max'], supportsDisable: true }, ['none', 'high', 'max']],
  ['gmodel (high/low/max, no disabled)',
    { efforts: ['high', 'low', 'max'] }, ['low', 'high', 'max']],
  ['gfmodel (high/max, already in strength order → unchanged)',
    { efforts: ['high', 'max'] }, ['high', 'max']],
  ['qwen3.8 (xhigh/low/medium + appended none)',
    { efforts: ['xhigh', 'low', 'medium'], supportsDisable: true }, ['none', 'low', 'medium', 'xhigh']],
  ['qmodel (thinking off only)',
    { efforts: [], supportsDisable: true }, ['none']],
  ['no efforts and cannot be disabled → empty array',
    { efforts: [] }, []],
]

/**
 * @param {(model: object) => string[]} qoderEffortsFor the real implementation under test
 * @param {(efforts: readonly string[]) => string[]} sortEffortsByStrength the real implementation
 */
export function verifyQoderEffortOrder(qoderEffortsFor, sortEffortsByStrength) {
  if (typeof qoderEffortsFor !== 'function') throw new TypeError('qoderEffortsFor is not exported')
  if (typeof sortEffortsByStrength !== 'function') throw new TypeError('sortEffortsByStrength is not exported')

  const eq = (actual, expected, label) => {
    const a = JSON.stringify(actual)
    const b = JSON.stringify(expected)
    if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`)
  }

  // ── 1. Each real model, one by one ──────────────────────────────────────────
  for (const [label, model, expected] of CASES) {
    eq(qoderEffortsFor(model), expected, label)
  }

  // ── 2. "Thinking off" is always leftmost (for models that have it) ──────────
  for (const [label, model, expected] of CASES) {
    const got = qoderEffortsFor(model)
    if (!got.includes('none')) continue
    if (got[0] !== 'none') throw new Error(`${label}: "thinking off" must land at the far left, actual position ${got.indexOf('none') + 1}/${got.length}`)
    if (JSON.stringify(got) !== JSON.stringify(expected)) throw new Error(`${label}: does not match the expected value`)
  }

  // ── 3. Known efforts must be monotonically non-decreasing in strength ───────
  const RANK = { none: 0, minimal: 1, low: 3, medium: 4, high: 5, xhigh: 7, max: 8 }
  for (const [label, model] of CASES) {
    const got = qoderEffortsFor(model)
    for (let i = 1; i < got.length; i += 1) {
      const prev = RANK[got[i - 1]]
      const cur = RANK[got[i]]
      if (prev === undefined || cur === undefined) continue
      if (cur < prev) throw new Error(`${label}: strength order broken (${got[i]} at position ${i} is weaker than the previous ${got[i - 1]})`)
    }
  }

  // ── 4. Unregistered ids go last, keeping their original relative order ──────
  eq(sortEffortsByStrength(['max', 'turbo', 'low', 'zen']), ['low', 'max', 'turbo', 'zen'],
    'unregistered ids go last and keep their original order')
  eq(sortEffortsByStrength(['alpha', 'beta', 'gamma']), ['alpha', 'beta', 'gamma'],
    'all unregistered → original order unchanged (zero behaviour change for unknown providers)')

  // ── 5. Same rank is stable: off/none and high/on ────────────────────────────
  eq(sortEffortsByStrength(['none', 'off', 'low']), ['none', 'off', 'low'], 'off/none have the same rank → keep original order')
  eq(sortEffortsByStrength(['on', 'high', 'max']), ['on', 'high', 'max'], 'high/on have the same rank → keep original order')

  // ── 6. Idempotent + does not mutate its input ───────────────────────────────
  const input = ['high', 'max', 'low', 'none']
  const snapshot = JSON.stringify(input)
  const once = sortEffortsByStrength(input)
  if (JSON.stringify(input) !== snapshot) throw new Error('sortEffortsByStrength mutated the input array')
  eq(sortEffortsByStrength(once), once, 'sorting is idempotent')

  // ── 7. Edge cases ───────────────────────────────────────────────────────────
  eq(sortEffortsByStrength([]), [], 'empty array → empty array')
  eq(sortEffortsByStrength(['none']), ['none'], 'a single effort is returned as-is')
}
