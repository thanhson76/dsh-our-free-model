# EAC Client Seal Migration

The existing client already supports a worker gateway with a path prefix, so no new address-override configuration is needed, and the host gate, user authorisation and OAuth are not modified. The migration only replaces `src/vault-data.js` and `src/vault-anchor.js`.

## Private input

Save UTF-8 JSON (Windows BOM supported) in a controlled directory outside the repository:

```json
{
  "workerBase": "https://ourfreemodel.beichenapi.com/eac/v1",
  "signingSecret": "<the real signing secret, exported in a controlled way from the new server>"
}
```

Placeholder content cannot be used for an actual migration. The secret must match the signing secret accepted by the server exactly, be at least 32 characters, and carry no leading/trailing whitespace or control characters. The tool does not generate or rotate the signing secret for the server. The OAuth client secret is not this signing secret. No upstream API key is needed.

## Offline generation and review

```powershell
node scripts/mint-eac-seal.mjs "D:\ofm-private\eac-new.json" "D:\ofm-private\seal-candidate"
node scripts/mint-eac-seal-test.mjs
```

The output directory's parent directory must already exist, and the output directory itself must not exist. The tool refuses private input inside this working tree, refuses to overwrite existing output, and does not automatically install or change a running client. The directory-permission parameters cannot substitute for ACLs on Windows; the private JSON should be placed by a controlled export process into a directory that already has access restrictions.

The tool randomly generates three 32-byte shards, a mask seed and a 12-byte IV, uses the existing HKDF and AES-256-GCM formats, and then verifies the in-memory result and the on-disk files through the runtime decryption function. Neither success nor failure prints configuration values, file paths or the original exception. JavaScript strings cannot be guaranteed to be zeroed from memory; do not handle real material in a shared environment.

The output is `vault-data.js` and `vault-anchor.js`. Both must be reviewed together and replaced into `src/` together. If generation fails, no partial output may be installed; investigate the cause and retry with a brand-new output directory. The seal is the project's existing reversible packaging and is no substitute for server authorisation; do not publish the private input, and do not treat the generation tool as a way to bypass authorisation.

## Verification and rollback

After installing the reviewed seal pair, run:

```powershell
node scripts/mint-eac-seal-test.mjs
node scripts/vault-test.mjs
node scripts/eac-auth-test.mjs
node scripts/eac-login-test.mjs
git diff --check
```

The offline tests only prove format and protocol compatibility; matching the real signature, gateway availability and login still require authorised integration testing. Publishing a change to the seal files additionally requires the maintainer to run the repository's existing release signing process; do not forge a manifest signature yourself.

A rollback must restore both seal files of the previous version together. Whether the old version remains reachable depends on whether the server keeps the old gateway and old signature; a client rollback does not modify the server. This process does not operate OAuth forms or expiration settings.
