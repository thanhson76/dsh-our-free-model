# #738 Fix Verification: Change the icacls Grantee to the Current User's SID

## The defect

On Windows, `restrictPermissions()` executes

```
icacls <file> /inheritance:r /grant:r "<USERNAME>:F"
```

`<USERNAME>` is a bare account name. When the computer name and the login account name differ only by case (allowed by Windows and common on personal machines), `icacls` resolves that name between the account database and the computer account, and **the computer account wins**. The ACE written therefore points to `S-1-5-21-<machine>` — a SID that no user token carries; and the `/inheritance:r` in the same call has already removed the inherited ACEs first. The file is thus left with a single ACE that matches nobody: the subsequent `fs.renameSync` inevitably fails with `EPERM`, and the file, together with the content already written to it, becomes unreadable, unwritable, and undeletable.

`restrictPermissions()` serves all of the private on-disk paths that use "temporary file + rename" (`eac-user.js`, two places in `store.js`, `updater.js`, `picks.js`, `egress.js`, two places in `magpie-engine.js`, three places in `subscriptions.js`, and three places in `packages/standalone`), so on this machine login tokens, `settings.json`, `catalog.json`, and `upgrade-state.json` all existed only in memory, and the upgrade flow was also stuck at persisting its state to disk.

## The solution

`src/open-external.js` adds `currentUserGrantee()`:

1. `whoami /user /fo csv /nh` obtains the current token's SID, and prefixes it with `*` before handing it to `icacls` (the `*` explicitly tells icacls this is a SID, so it should not do name resolution).
2. When `whoami` is missing or fails, fall back to the fully qualified name `USERDOMAIN\USERNAME`; this is still stricter than a bare name, because it names the account domain and no longer leaves the either/or choice to icacls.
3. The result is memoized per process: a token's SID does not change during the process lifetime, while these stores flush on a timer.

The original motivation for PR #637 is preserved: the **account name** output of `whoami` goes through the OEM code page, and a non-ASCII machine name would be destroyed by UTF-8 decoding. A SID is pure ASCII and contains no localizable text, so that concern does not apply to a SID.
The semantics of `restrictPermissions()`, its behaviour of throwing / abandoning the write, the POSIX branch, and all call sites are unchanged.

## What was run

Local environment: Windows 10.0.26300.9818 / Node v24.15.0, `COMPUTERNAME=COLOR`, `USERNAME=color`, `USERDOMAIN=COLOR` (i.e. the triggering condition holds).

- **Before the fix**: `node scripts/private-file-permissions-test.mjs` → `5 private-file check(s) failed`, with the first failure being `the DACL does not name S-1-5-21-...-1001: <file> COLOR\:(F)`, and `renameSync` reproducing `EPERM`. Simulating `USERNAME=COMPUTERNAME` with the same code independently reproduced `RESULT: REPRODUCED — EPERM`.
- **After the fix**: `5/5 private-file checks passed`; the same reproduction script output `RESULT: still accessible`.
- The assertion criterion was strengthened from "the ACL text contains `(F)` and does not contain `(I)`" to "the DACL's SDDL must contain **the current token's SID**" (the output of `icacls /save` is always recorded in SID form), which is what actually constrains this defect; the old `(F)` assertion also held on the bad ACE and could not catch it.
- Added an end-to-end case: under the premise that `USERNAME`/`USERDOMAIN` are the same as `COMPUTERNAME`, run through the entire private on-disk path of "write tmp → restrictPermissions → rename over the official file → read back".
- `node scripts/test-all.mjs --mode contributor`: **103/108**. The 5 failures were benchmarked with `git stash` as pre-existing failures unrelated to this change: `legacy-upgrade` (the shallow clone lacks the `f14d261` object; CI with `fetch-depth: 0` does not trigger it), `magpie-engine` (4 reviewer regressions, also failing on the baseline), `magpie-policy`, `standalone-management` (`registry.npmjs.org` unreachable + leftover `EPERM` temporary directory, also failing on the baseline), and `forward` (concurrency flakiness, passed 2/2 when run alone).
- All directly affected suites passed: `private-file` 5/5, `open-external`, `updater`, and `subscriptions` 38/38.
- `node --check` and `git diff --check`: passed.

## Boundaries

- Domain accounts and Microsoft accounts were not covered on real hardware (this machine uses a local account); the fallback branch only guarantees it is no weaker than the original implementation, and was not tested in an environment without `whoami`.
- Not run on real POSIX hardware; that branch's code is unchanged and is covered by CI on Linux.
- Files with a bad ACE that already exist but were **not fixed by this change** will not heal themselves: `restrictPermissions()` only handles newly written temporary files. Historical leftovers still need to be recovered manually with `icacls <path> /reset` (verified to be recoverable without losing content).
- `test:release` was not run (aligning the signed manifest belongs to the formal release process, which this branch does not touch).
