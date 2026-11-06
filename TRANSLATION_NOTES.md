# Translation notes — Chinese → English (Option 2: main code + docs)

This working copy translates the Simplified Chinese in this repository to English,
covering the main code, documentation and user interfaces. It was produced from
commit `efea046` of https://github.com/Ebony-Vinyl/dsh-our-free-model

## What was translated

- `README.md` is now the English primary (based on the author's `README_EN.md`,
  with its remaining Chinese fragments translated). The original Chinese README
  is preserved verbatim as `README_ZH.md`. `README_EN.md` is kept and aligned.
- All documentation: `docs/**` (top level, `plans/`, `releases/`,
  `superpowers/specs/`, `testing/`, `verification/`), `PACKAGING.md`,
  `packages/standalone/README.md`, `worker/README.md`, `src/o2a/SYNC.md`.
- Main code comments, doc-comments and plugin-authored strings:
  `src/**`, `index.js`, `client.js` (outside the dictionaries — see below),
  `adapter/`, `worker/` (including the dashboard and GitHub-auth pages),
  `feed/announcements.json` (ids, dates, URLs unchanged).
- Standalone app: `packages/standalone/*.mjs`, `packages/standalone/channels/*.mjs`
  (except the generated bundle), and the hard-coded Chinese frontend in
  `packages/standalone/frontend/**`, which is now English — including switching
  its dictionary lookups from `DICT.zh` to `DICT.en` and date/number formatting
  from `zh-CN` to `en-US`.
- Desktop shell: `packages/desktop/**` (splash screens, Tauri Rust sources,
  titlebar, installer hooks).
- `scripts/**`: comments, test names and assertion messages. Assertions that
  check plugin-authored copy were updated to the English wording of the
  translated sources.
- `package.json` description, `.github/workflows/*`, `.gitignore`,
  `cordis.patch.yml`.

## Deliberately NOT translated (by design)

- **`vendor/**`** — out of scope for this option (24,797 lines with Chinese).
  Because the vendor tree is untouched, the bundles generated from it still
  contain Chinese (see "Regenerated artifacts" below).
- **Intentional Chinese locales** — `locale/zh.json` and the `DICT.zh`
  dictionary in `client.js` (lines 39–815, verified byte-identical). The plugin
  is bilingual; `DICT.en` already existed beside it. Conditional zh-locale
  branches (`locale === 'zh' ? … : …`) were kept in both languages.
- **Strings that match upstream Chinese text** — e.g. the regex in
  `src/http.js` matching Chinese GitHub-authorisation errors, CJK-detection
  logic in `src/magpie-policy.js`, Chinese Windows adapter names in
  `src/forward.js`, the New API panel label in `worker/entry.js`, and tests
  that match Chinese onboarding screens of upstream apps. Translating these
  would break runtime detection.
- **Chinese-locale test expectations and fixtures** in `scripts/` — tests that
  mount `DICT.zh`, simulate upstream Chinese responses, or use Chinese text as
  a Unicode/multibyte fixture (paths, payloads, tool names).
- Small numbers of quoted literals in docs that record Chinese UI labels or
  verbatim quoted text (e.g. the zh navigation labels in
  `docs/superpowers/specs/2026-10-15-plugin-upgrade-nav-design.md`).
- Award/badge artwork in `docs/images/*.svg` and the QQ group proper name in
  the READMEs (kept with an English gloss, as the author's README_EN did).
- Wenyan prompt texts in `src/token-saver/prompts.js`, ported verbatim from an
  upstream skill and pinned by a test.

In total about 280 lines with Chinese remain in the translated scope, every one
in the categories above; `client.js` additionally keeps its 746-line zh
dictionary.

## Regenerated artifacts (so generated files match their generators)

- `packages/standalone/channels/business.mjs` was regenerated with
  `node scripts/build-standalone-channels.mjs` (only the 4 lines the build
  script injects changed — header, one error message, one comment; all
  vendor-derived content is unchanged). Its `--check` passes.
- `packages/standalone/web/**` was rebuilt from the translated frontend with
  `npm --prefix packages/standalone install` + `node scripts/build-standalone-ui.mjs`.
  Asset file names changed because their content hashes changed; `assets.json`
  was updated by the build. `web/splash.html` is a hand-maintained static file
  (not build output) and was translated directly.

## Verification

- `node --check` passes on every edited `.js`/`.mjs` file; all edited JSON
  parses; `scripts/client-lint.mjs` passes.
- `npm --prefix packages/standalone run typecheck` (tsc) passes.
- Full test suite (`node scripts/test-all.mjs --mode contributor`):
  **102/109 suites pass — identical to the untranslated original in the same
  environment.** The 7 failing suites (legacy-upgrade, reload,
  auto-checkin-tick, channel-source, channel-network, eac-abort, gateway-source)
  fail on the pristine original too (missing root dev dependencies / network),
  so the translation introduces no regressions.

## Runtime smoke test (2026-11-06) and one fix

The standalone service was run for real (`node packages/standalone/cli.mjs`):
health endpoint OK, the served console page is English (`lang="en"`,
"Local Console"), `GET /v1/models` with the forward key returns the live model
catalog, and a chat completion was routed to the upstream free lane and
returned its genuine rate-limit response (upstream quota, not a code error).
`node scripts/host-selftest.mjs` (plugin host half against a fake host) also
passes. One leftover was found and fixed in this pass: the CLI startup banner
printed `API：` with a fullwidth colon — `packages/standalone/cli.mjs` now
prints `API: `, and the matching assertion regex in
`scripts/standalone-package-test.mjs` was updated to match. The full suite was
re-run after the fix: still 102/109, same 7 pre-existing failures as the
original.

## Maintainer step still required before release

- The release manifest digests (`scripts/build-manifest.mjs --check`) no longer
  match the edited files. Regenerating the manifest requires the maintainer's
  signing key, which is not part of this translation:
  `node scripts/build-manifest.mjs --key <pem-path>` (or set `OFM_MANIFEST_KEY`).
  This is the normal post-change release step; the in-app upgrader rejects
  unsigned manifests by design.
