# Releasing and Announcements (Repository Owner)

This document is for maintainers and is not part of the release: `package.json`'s `files` does not include `docs/`, so it
is never installed onto a user's machine and never appears in [`README.md`](../README.md) — the README only covers what users
need to know.

Everything is done through the `feed/` directory at the root of the plugin repository: **pushing is publishing**.

For the division of checks between ordinary contributors and maintainers, and the protected signature-patch preparation flow, see
[`contributor-ci-signing.md`](contributor-ci-signing.md). Contributors run
`npm run test:contributor`; `release-readiness` must pass before merging into main,
and the default `npm test` still includes the full release verification. Do not let contributors hold the release private key.

## Push an announcement

Edit [`feed/announcements.json`](../feed/announcements.json) and add one entry to the `announcements`
array:

```json
{
  "id": "2026-10-01-something",        // globally unique; an id that has appeared before never alerts again
  "title": "One-line title",
  "level": "info",                     // info | update | warn | urgent
  "pinned": false,                     // optional, pin to the top
  "createdAt": "2026-10-01T00:00:00Z",
  "expiresAt": "2026-10-15T00:00:00Z", // optional, disappears automatically when expired
  "link": { "url": "https://…", "label": "View details" },  // optional
  "html": "<p>Body text, <strong>supports allowlist-restricted HTML</strong></p>"
}
```

`urgent` triggers a full-screen modal. The body HTML is parsed by the client's allowlist renderer — scripts, event attributes,
`javascript:` URLs, iframes and the like are all dropped (see `scripts/sanitize-test.mjs` for the tests),
so a tampered repository does not turn into code execution either.

## Release a new version

After changing the code —

```bash
# 1. Change the version in package.json, the local tarball install version numbers in both READMEs
#    (the catalog suite validates the file-name version) and feed/announcements.json (the version notes)
# 2. Regenerate the manifest (writes each release file's byte count and SHA-256 into feed/manifest.json;
#    the same file list is also written into catalog/integrity.json, for ecosystem catalog auditing)
node scripts/build-manifest.mjs --key /secure-directory/existing-release-private-key.pem
# 3. Confirm the manifest matches the actual files (exits non-zero if not; already wired into npm test)
node scripts/build-manifest.mjs --check
# 4. Commit and push (for the two-step commit of the catalog-record revisions, see the next section), then tag and create a Release
git tag -a v1.2.3 -m "…" && git push origin v1.2.3
gh release create v1.2.3 --title "…" --notes-file …
# 5. Purge the CDN cache — the whole @main tree, not just those two feed files (see the next section for why)
curl "https://purge.jsdelivr.net/gh/Ebony-Vinyl/dsh-our-free-model@main"
# 6. Re-verify the release artifacts in the identity of an "already installed user": download the manifest, verify each file's byte count and SHA-256, then read it back
node scripts/live-audit.mjs          # only when this prints OK does it count as published; on FAIL, act on the hints it gives
```

Step 2 is not optional: the manifest is the publisher's **promise of each file's byte count and SHA-256**. Change a release
file without re-running it, and the client downloads the new file but verifies it against the old hash, and the verification mechanism will (correctly) refuse to install — so
this version's one-click upgrade fails for every user on an old version. `--check` is what makes this kind of thing fail before committing.

Both `--key` and `OFM_MANIFEST_KEY` accept a private-key **file path**; when there is no existing private key, writing is refused,
and no placeholder signature may be committed or public key replaced. The protected workflow's `RELEASE_MANIFEST_PRIVATE_KEY`,
by contrast, is the PEM **content**, used by the trusted main's `prepare-release.mjs`; do not mix the two up.

Digests are computed over **LF-normalised bytes**, not working-tree bytes: `.gitattributes` is
`* text=auto eol=lf`, users download the blob, and an editor can change the working tree to CRLF while
`git status` stays clean. `scripts/release-e2e.mjs` rewrites all release files to CRLF and runs
`--check` again; the old algorithm failed outright at this step.

Installed plugins automatically discover a new version according to `updateCheckHours` (default 6 hours) and push a notification;
after the user confirms, downloading, verification, backup, replacement and hot reload all complete inside the app. The manifest verifies each file's
SHA-256, and is fetched once more before installation, to avoid verifying new files against a stale manifest.

## Release consistency on main is mandatory (ruleset)

**Pushing is publishing** means "changed a release file but did not re-sign the manifest" is not an ordinary red CI light, but makes every old
version user's one-click upgrade fail on the spot (the 1.4.5 incident, and the 1.4.6 drift on main on 2026-10-06, were both of this kind).
The repository therefore has a ruleset on main: the `offline` and `release-readiness` checks are both required, and
changes must go through a PR — a tree whose manifest does not match its files is stopped before merging, rather than letting users hit the wall after release.

This brings two disciplines:

- If you changed any file in `package.json`'s `files` list, the same PR must carry the re-signed
  `feed/manifest.json` and `catalog/integrity.json` (just run `node scripts/build-manifest.mjs`
  once with the release private key), otherwise `release-readiness` goes red and the merge is refused.
- The ruleset itself is adjusted in the repository's Settings → Rules → Rulesets. In an emergency it can temporarily be set to
  inactive, but it must be restored afterwards; every merge that bypassed it must have the full verification run made up immediately.

## Catalog records and the revision convention

`catalog/dsh-plugin.json` (`source.revision`) and `catalog/provenance.json`
(`subject.sourceRevision`) record **the most recent commit that touched release content** — `package.json`
plus the `files` list, exactly the set of files that `catalog/integrity.json` describes byte by byte.
`scripts/catalog-test.mjs` validates against this, and the comparison target is deliberately not HEAD: a record cannot contain the hash of the commit that introduces
itself, so comparing against HEAD would make the catalog suite go red the moment the record is actually committed, and changing the
revision afterwards in a separate commit moves HEAD forward again — logically unsolvable. Comparing against "the most recent commit that touched release content" is both
truthful (committing the catalog records alone changes no release byte) and satisfiable (the commit that refreshes the revision only touches
`catalog/`, so the pointer it must match does not move because of it).

So content changes are committed in two steps:

1. **The content commit**: code, manifest and catalog records go in together;
2. **The refresh commit**: immediately afterwards, a single commit that only changes the two revisions above to step 1's
   hash — it must not change any release file along the way, otherwise verification keeps failing.

Only commits that touch release content move this pointer: changes to `docs/`, `scripts/` or `catalog/`
themselves need no refresh. The release tag is placed after step 2 (the release artifacts do not include `catalog/`, so the two steps' artifact bytes
are identical, but HEAD is in an all-green state).

## Pinned-commit fetching and the old-client transition (issue #120)

The new upgrader uses the default update URL to discover versions; before actually downloading, it resolves the full 40-character commit SHA in turn through GitHub's official
commits API, git upload-pack refs and the commits Atom feed,
then downloads the signed manifest from `raw.githubusercontent.com/<repo>/<sha>/feed/manifest.json` or
`cdn.jsdelivr.net/gh/<repo>@<sha>/feed/manifest.json`.
The manifest's relative `base` is resolved from this pinned URL, so all files come from the same commit.
When raw fetching fails and it switches to the CDN, it reuses the SHA resolved this time; clicking upgrade re-resolves, preventing the use of a result from hours earlier.

The existing public key, manifest fields and signature format stay compatible; the resolution interface only provides a download location and does not authorise code.
Manifest signature verification, file sizes and SHA-256, staging read-back and rollback all proceed as usual. If resolution fails, is rate-limited or times out, it errors,
and does not fall back to fetching from a mutable branch. Resolution and manifest reading for each mirror share a 15-second budget; a single resolution endpoint may take at most
3 seconds, and refs and Atom can still be tried when the API is rate-limiting. A pinned SHA `--source` and local test sources need no resolution.

When fetching a file for a pinned SHA from the primary jsDelivr and it encounters a connection failure, a redirect, 404, 429 or 5xx, it
can switch to the same SHA and path on `gcore.jsdelivr.net`; the two fetches share a single timeout budget.
It does not follow an arbitrary `Location` given by a response, does not fall back to another mirror on 401/403, and does not fall back on size or digest errors.
Every downloaded byte must still conform to the signed manifest; sources other than a pinned commit do not enable this file fallback.

Already-installed 1.x / old 2.0 clients still fetch from `@main`, and new client code cannot fix their current upgrade for them.
At release time the whole tree must still be purged, and each failing path purged individually; run the full fetch verification with an old upgrader,
and only after confirming the transition upgrade works can users obtain the new pinned-commit flow. `live-audit.mjs` verifies the new path by default,
and now displays the actual snapshot URL; the old path should be verified separately using that script from an old installation or an old commit.

The signed manifest must still match all files of the release commit it belongs to. A pinned SHA solves the CDN branch cache and the branch
moving during download; it cannot fix a code change that was not re-signed; the key-holding maintainer must still generate the signature and catalog records following the release steps above.
Vendor file verification must not be relaxed; the current 2.0.0 manifest contains only four vendor release files, not all of their development sources.

## On source order and network reality

The discovery source order is `raw.githubusercontent(main) → jsDelivr(@main) → gcore jsDelivr(@main) → gh-proxy(main)`.
The new upgrader pins a commit first and then fetches; if everything fails it errors and keeps the existing installation; announcements still use the original cache fallback.
The `DEFAULT_*_SOURCES` arrays and download implementation in `src/feed.js` and `src/updater.js` are authoritative.

raw is first because it is **authoritative and uncached**: push, and it can be read immediately. But on some networks (measured: a local CN
egress + a Watt Toolkit-style accelerator) it simply does not work — `git push` is normal, while raw returns a fake
404 for a new file, or fails TLS outright (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). On those networks jsDelivr is the only
source, which makes the next point very important.

**jsDelivr's freshness is not as reliable as the cache-buster suggests** (measured 2026-09-26). Requests do carry a
minute-level `?ofm=` parameter automatically, but jsDelivr puts the "branch → commit" resolution for a branch reference like `@main` in
a separate cache layer that the query string does not reach. Measured: after pushing v1.2.2, jsDelivr still returned v1.2.1's manifest
(including the previous version's byte count for `README.md`) and v1.2.1's announcement; after an explicit purge both immediately became
v1.2.2.

The consequences, concretely: on a network where raw does not work and only jsDelivr is available, users on old versions get a **stale manifest**,
so "check for updates" answers "already up to date", the one-click upgrade never appears at all, and new announcements are not received either. This is the same class of failure as
issue #1, only one layer down. A new repository's first indexing also lags (creating a Release triggers it).

So the last step of the release flow is the purge; without it, you wait for the CDN to re-resolve on its own, usually several hours:

```bash
curl "https://purge.jsdelivr.net/gh/<repo>@main"
```

**What must be purged is the whole `@main` tree; purging only `feed/*.json` is not enough.** v1.3.1 (2026-09-27) is the counter-example
: after purging only those two feed files, `…@main/feed/manifest.json` immediately became 1.3.1, while on the same
CDN `…@main/index.js` still returned v1.3.0's 56 999 bytes — while the manifest declared 60 224. That is worse than
not purging at all: when nothing is purged, the user gets the old manifest with the old files, self-consistent, only "check for updates" answers "already up to
date"; while a new manifest with old files makes `stageRelease` fail when verifying against the manifest (a safe failure — it refuses to install and keeps
the old version, but this version simply cannot be published to users on that network). In the same measurement, both `…@v1.3.1/index.js` and
`…@<commit sha>/index.js` returned the correct 60 224, showing that what jsDelivr caches is the `@main` **branch
name-to-commit resolution**, and the file layer ages along with it; and after the purge returned `"status":"finished"`, the file
layer still lagged by several minutes.

The 1.4.5 re-signing re-check on 2026-10-05 measured an even worse split state: after a whole-tree purge (`finished`, with both the CF and FY
providers reporting true), `…@main/feed/manifest.json` and the four files `client.js`, `package.json`,
`src/feed.js` and `src/updater.js` were still the old commit's bytes, while the other files were new — exactly the "new manifest
with old files" half that blocks an upgrade; then **purging each file path individually** (`…@main/<path>`) made the manifest and the four
files turn new immediately, and the upgrade path went fully green on the spot. So a whole-tree purge is the first step, not a guarantee: after purging you must run
`live-audit.mjs`; when it fails it names exactly which files are bad — purge each of those paths once more and re-run.
`live-audit.mjs` now reports "all reachable sources pass, the remaining sources are unreachable" as success (raw is simply unreachable on CN networks anyway);
only a genuinely bad release returns non-zero.

That is why step 6 is: run the whole upgrade path in the identity of an already-installed user, rather than curling the manifest to look at a version number.
`scripts/live-audit.mjs` calls the plugin's own `downloadManifest` → `stageRelease` →
`verifyStaged`; its printing OK is equivalent to a user on an old version clicking "one-click upgrade" and succeeding. The manifest's `base` is `"../"`,
resolved relative to the manifest's own URL, so running it against an immutable ref (`--source …/@v1.3.1/feed/manifest.json`)
verifies the release artifact itself, while the default three sources verify the path a user would actually take.

`feedUrl` only overrides the announcement source (including the `{repo}` placeholder); it does not change the upgrade source or the signing trust root.
Local upgrade tests inject `defaultSources` from the test program; release re-verification uses `live-audit.mjs --source`.
