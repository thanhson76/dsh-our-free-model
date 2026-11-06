# 2.7.2 legacy upgrade compatibility design

The user has confirmed: use the latest mainline code, upgrade legacy versions directly to the complete 2.7.2, and release after validation passes.

## Problem and constraints

The original 2.5.9 upgrader limits the manifest to at most 80 files, each at most 4 MiB. 2.7.1's 93 files and its 68,578,304-byte engine are both incompatible. Changing the upgrader limits only in the new version cannot help users who have not yet upgraded.

## Confirmed approach

The release format continues to use the signed manifest, per-file verification and atomic replacement already supported by the old upgrader, without changing the trust key. The Token savers runtime code is merged into a single generated file, keeping the original modules for maintenance and testing; build-only files are excluded from the plugin release manifest. The engine is gzip-compressed and split into 9 binary files of no more than 4 MiB each. The preliminary estimate is a 79-item manifest, with the actual count determined by the build and tests.

The engine shard metadata records each shard's size and digest, the compressed body's size and digest, the decompression cap and the final executable's digest. The metadata is protected by the release manifest's signature. At runtime, shards are read only from the locally installed ones, verified, and decompressed into a versioned cache in a separate data directory, using temporary files and atomic replacement; corrupted shards, missing shards, illegal paths and over-limit output must be rejected, and fetching replacements from untrusted addresses is forbidden. Existing complete engines and engines explicitly specified by tests remain compatible.

The complete latest plugin feature set is kept, including the Kilo free pool, water-level statistics, the five-cell status and separate probe sessions. The user has further limited this work to the plugin side only; the desktop product version is not changed, and no desktop installer is built or released.

## Acceptance and release

1. The release manifest has no more than 80 items, each no more than 4 MiB, and the generated assets are reproducible.
2. Using the original 2.5.9 upgrader from Git, run a real per-file download, signature verification, staging, installation, activation and failure rollback; the legacy limits are not modified.
3. Import the latest plugin from the actually-upgraded directory and verify that settings and user data are preserved; on Windows, start the real engine from the shards, verify the management interface, and close the process.
4. Verify rejection of corrupted shards, recovery from a corrupted cache, concurrent recovery and subsequent upgrades. The legacy upgrade and the compatibility budget become offline release checks.
5. Run the full contributor checks, type checking and standalone front-end build checks; generate the production signature through the existing trusted signing workflow, then run the release checks.
6. The 2.7.2 plugin package is built from a fixed commit, generating SHA256SUMS, a provenance record and release notes in Chinese. Verify the actual plugin artefact before public release; real upstream calls that were not performed must not be written up as passing. The desktop side is outside the scope of this release.

## Rollback

If the upgrade fails, the old upgrader restores the original package and keeps the recovery evidence. The engine cache and user configuration are stored separately and do not overwrite accounts, configuration or statistics data. If a rollback is needed after release, use the previous version's trusted installer package; no automatic-upgrade manifest with a lower version number is published.
