# 2.7.2 Implementation and Verification Plan

Execute in the following order, following the direct-upgrade design the user confirmed; do not use extra agents or separate chats.

1. Establish a reproducible Token-saver runtime packaging and engine compression-shard build, with an explicit plugin release file list; bump only the plugin version to 2.7.2, keeping the desktop and standalone product versions unchanged.
2. Implement local shard verification and atomic engine restoration, covering full-engine compatibility, corruption, missing shards, output boundaries and cache recovery.
3. Pin the original legacy upgrader as a regression fixture, and verify installation, activation, data retention, failure rollback and re-upgrading against the current real release files; add contributor and release gates.
4. Run targeted checks, the full contributor tests, and the type and generated-asset checks. Fix actual failures; do not loosen legacy constraints or skip signing.
5. Commit in batches, in Chinese, and produce a reviewable PR; obtain a production signature through the existing trusted release-preparation workflow, verify and merge. If branch protection blocks this, provide the concrete mergeable PR for the user to handle.
6. Build the plugin package from the pinned release commit, verify the artefacts and the legacy upgrade path, produce verification and provenance records, release v2.7.2 and check the download assets. The user explicitly excluded the desktop build, so no desktop installer is built or released this time.
