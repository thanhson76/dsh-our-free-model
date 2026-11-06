# Issue #93: Upgrade Failure and Version Status Fixes

## Scope and assumptions

- The user has confirmed implementation following the upgrade and rollback fix plan; the audience is users of the plugin's in-app self-update.
- Fix the reproduced problems in the code: lost errors, confused version identifiers, premature success history and backup safety issues.
- Do not modify Windows owners, ACLs or pnpm state; the cause of the directory-permission damage is not yet confirmed.
- Continue to use the fixed public key, the signed manifest and digest verification of all files, without lowering the trust requirements.
- No runtime dependencies and no extra network requests; backing up adds local file-set and digest checks, with work proportional to the package size.
- Recovery records contain only the upgrade stage, versions and errors; they do not record request content, secrets or user sessions.

## Decisions and implementation

### One upgrade covers both installation and activation

The Host passes an `activate` callback to `PluginUpdater.apply()`, and the real `selfReload()` confirms the activation result.
Only after file verification succeeds and all new fibers have started is the success history recorded and the browser notified.
The upgrade reload checks the module's target version before replacing the old instance; the upgrader checks the version returned by activation again before committing the success record.
If the cache still returns the old module, or a version identity is missing, no success is committed and the rollback or unresolved-recovery flow is entered.
The standalone release audit provides no callback; `activated=false` in a success record means it only verified the installation.

Compared with correcting the history after installation, this avoids a brief but observable false success record.
Hot reloads within the same process use a shared lock before and after; the new instance reads the persistent history and state and cannot concurrently overwrite the installation.
The upgrade notification is sent through a callback provided by the new instance and does not access the destroyed old instance's settings store.
A hot reload disconnects SSE, so a success event may arrive before reconnection; the client ends the local upgrade stage via the upgrade request's success response,
refreshes the state and restores the button, without depending on the success event necessarily arriving.

### Running identity and disk identity are separate

The Host module captures and exports `version` at evaluation time; when the old module in the cache is re-registered, the new disk version is no longer read.
The upgrade state keeps the `current` field for the running version, and adds `runningVersion`, `installedVersion`,
`versionMismatch`, `recoveryRequired` and `phase`.

The panel displays both versions; when the versions differ or an unresolved recovery exists, it does not display "already up to date".
Equal versions do not prove the files are intact; a known incomplete transaction also displays a recovery warning.
A cold start that cannot import the plugin still needs recovery outside the app; the panel cannot fix a module that never started at all.

### Backup and recovery

First make the backup in a separate temporary directory, verify the file set, sizes and digests, then replace the retained `rollback` copy.
If the backup fails, the existing usable backup is not overwritten and the installed files are not modified.
The new backup carries a hidden `.ofm-backup.json` verification record; backups from old versions without a record can still be used,
but can only confirm the files they currently have, not prove whether other files were historically missing.

Verify the backup before restoring: copy the old files first, then clean up files the old version did not have; failures in both copying and cleanup must be reported.
After restoring, verify the file set and digests again. The original failure and a rollback failure are both retained; a disk restore must not be described as a running-module restore.
Ordinary manual reloads and source-watching reloads do not touch the upgrade backup, to avoid overwriting development changes.

### Interruption and the recovery gate

Before overwriting files, write `upgrade-state.json`, recording the `installing` / `activating` intent.
On completion it is `complete`; on successful rollback, `rolled-back`; on incomplete recovery, `recovery-required`.
An unfinished intent with no active in-process transaction is treated as interrupted and does not display "upgrading" forever.

While a recovery is unresolved, further installation and reloading are forbidden, and the backup location is retained.
After a manual recovery and restart, checking for updates verifies all bytes of the current disk and the backup, and the old running version;
the recovery gate is lifted only if they match. If the directory cannot be accessed or the backup is damaged, the gate is not lifted automatically.

## Verification design

- `scripts/updater-test.mjs`: signature fixtures and the real `selfReload()`, covering import failure,
  new-fiber start failure, old-running recovery failure, normal activation, installation and rollback refusals, a damaged backup,
  backup failure, cleanup failure, and interrupted state and manual recovery.
  It also covers the Host cache returning the old module, and the activation callback returning an old version or a missing version being refused.
- `scripts/upgrade-ui-test.mjs`: the real client components and an isolated Host copy, covering the two-version display,
  an incomplete installation at the same version, the success-indicator gate, success without SSE and failure responses releasing the button,
  the old module identity, and ordinary reloads not overwriting the disk.
- Fault-injection verification covers code branches; it is not equivalent to Windows native ACL, antivirus-software lock or real desktop HMR acceptance.

## Delivery and rollback

The signed release set was modified, so before release the maintainer must re-sign the manifest and update the catalog records following the release specification.
Contributor offline tests use one-time test keys and do not need the release private key.
This fix will not repair previously damaged Windows directory permissions.

When rolling back the code, close the app and restore the previous verified installation. The old version does not understand the new transaction state,
so any existing recovery should be completed first and the backup retained before downgrading, to avoid the old version bypassing the recovery gate and continuing to overwrite.
