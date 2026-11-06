# 2.7.2 Plugin Upgrade Verification

Scope: the plugin side only. The desktop and standalone product versions were not changed, and no desktop installer is built or released.

## Actual results

- `node scripts/test-all.mjs --mode contributor`: 98/98 suites passed, exit code 0.
- `node scripts/test-all.mjs --mode release`: 5/5 suites passed, exit code 0; including the real production signature check.
- `node scripts/legacy-upgrade-test.mjs`: 8/8 passed; the original 1.3.1 and 2.5.9 upgraders completed the download and installation of the real 79 files.
- `node scripts/legacy-upgrade-test.mjs --production`: passed again under the production signed manifest; the historical upgrader source, public key and size limits were not changed.
- `node scripts/engine-payload-test.mjs`: 7/7 passed, covering concurrent restoration, corrupt-cache recovery, corrupt shards, missing shards, invalid paths, output limits, digests and generated-code behaviour.
- `node scripts/build-legacy-payload.mjs --check`: passed; the packaged code matches the source, as do the published shard digests and the restored engine.
- `npm run typecheck`, `node scripts/catalog-test.mjs --contributor` and `git diff --check`: passed.

The first full-check round found that the installation documentation still pointed to 2.7.1 and that the shared source package was missing a new module. Both were fixed; the final full check is the 98/98 above, and the first round's failures are not counted as passes.

## Historical versions and artifacts

The historical upgrader fixtures were verified byte for byte against the corresponding Git objects, and the real old installation packages were extracted from archives of the historical release commits. The old version's 80-file and 4 MiB limits both remain unchanged. The negative fixtures can still reproduce and reject 93 files and oversized files.

Verified: the upgraded plugin entry point loads, user data is retained, the original files are restored when activation fails, installation is refused when a real shard is tampered with, and the new upgrader does not need to upgrade again when it re-checks the same signed version. On Windows, the engine was restored from shards in the real upgrade directory, started, and the authenticated administration interface was accessed; the test process was closed afterwards.

The production signature comes from mainline's `prepare-release` workflow run `40269127939`, and the signing candidate is `ac5364b890adc90dbc8f1c3e9c372d0b4c8a37c4`. The receipt, patch digest and all 79 runtime contents were verified; later commits fixed only build checks and documentation, with the runtime bytes unchanged. The signing private key remains in GitHub Actions at all times.

The local upgrade regression used a loopback HTTP service and did not call a real model upstream. The verification results for the public download address, release tarball and checksum records are provided with the Release artifacts; this note does not count a public download check that has not yet been completed as passed.
