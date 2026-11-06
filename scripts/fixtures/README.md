# Historical upgrader regression fixtures

These two files are complete copies of `src/updater.js` at the corresponding versions in Git, kept byte-for-byte, without changing the file count, per-file size or signature limits.

- `updater-1.3.1.mjs`: commit `f14d261557ae98e5d28eaa33f4471302cc7f35ad`.
- `updater-2.5.9.mjs`: commit `313eaa45c3abc769cd4169326b9b4e7161d141a9`.

They remain under the project's MIT license. The tests also check that the fixtures match the historical Git objects; installed packages are likewise extracted from the real release files at those commits, rather than disguising new code as an old version. Contributor tests use a one-time signature only for 2.5.9, which supports injecting a test public key; release verification uses the real signed manifest and the original public key.
