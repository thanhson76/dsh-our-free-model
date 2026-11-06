# issue #151: Fix for Spilling Tool Results Containing Images to Disk

## Scope and approach

The fix is based on the repository mainline `720aa6e` as queried on 2026-10-10. The host's npm release tags were queried at the same time: `next` is `0.2.0-rc.2` and `alpha` is `0.2.1-alpha.2`; npm's old `latest` tag was not mistaken for the current candidate version.

The minimal fix direction suggested by the issue was adopted: when the image pricing protocol is missing, a fallback pricer is returned synchronously. Each occurrence of an image still in the request is estimated at 1024 visual Tokens; an image that has already been offloaded is estimated at 0 visual Tokens and placeholder text is returned, while the text part is left for the host to estimate. Different vendors' actual visual Tokens may be higher or lower than this estimate; 1024 does not represent a real bill or an upper bound for all models.

Anonymous free and regional routing return the shared pricer directly; the 13 account channels fill in the missing capability in the existing adapter registration wrapper. A vendor's existing pricer takes priority, real exceptions continue to propagate, and the original object's `this` is preserved on calls. The shared implementation performs in-memory computation only, with no network, file reads or asynchronous operations.


## Reproduction before the fix

The officially published `dsh-llm`, `dsh-spill-policy` and their dependencies were installed in an isolated directory; adapters were registered using the actual published channel pack, and the real LlmRuntime's pricing forwarding method and the real spill-policy's `tools/post-execute` handler were used. Surrounding context, file mappings and storage interfaces were isolated stand-ins, and saveText actually wrote to a test file. No full desktop tool executor or real model service was used.

The input was 512000 bytes of fixed text; the with-image scenario added one valid 1×1 PNG, and the spill-to-disk budget was 12500 Tokens.

| --- | --- | --- | --- | --- |
| 0.1.7-rc.2 | Spilled to disk, about 50KB preview | Not spilled | Not spilled | Spilling restored |
| 0.2.0-rc.2 | Spilled to disk, about 50KB preview | Not spilled | Not spilled | Spilling restored |
| 0.2.1-alpha.2 | Spilled to disk, about 50KB preview | Not spilled | Not spilled | Spilling restored |

All three versions showed: `spill-policy: Error: the current model has no image token calculator; keeping the inline content`. After the image was attached, the whole text was retained, proving the error occurred before saving.

## Verification after the fix

`scripts/image-pricing-host-test.mjs` provides a repeatable real-host integration check. The command's second argument is an isolated directory containing the corresponding host's `node_modules`; the script does not install dependencies itself. Each host version verifies spilling with images for the 13 account routes, anonymous free and regional routing, plus a plain-text control.

Actually executed:

- `node scripts/image-pricing-host-test.mjs .verify/issue151-host`: 0.1.7-rc.2, all 15 routes passed.
- `node scripts/image-pricing-host-test.mjs .verify/issue151-host-next`: 0.2.0-rc.2, all 15 routes passed.
- `node scripts/image-pricing-host-test.mjs .verify/issue151-host-alpha`: 0.2.1-alpha.2, all 15 routes passed.
- Each group actually saved the full text and the image read address, and returned a shortened preview and a restore address, with no pricing-failure warning.
- `node scripts/channel-pack-test.mjs`: passed; covering synchronous return, empty images, duplicate occurrence positions, offloaded images, result objects not contaminating each other, the host's default empty method, vendor implementations taking priority, and exception propagation.
- `node scripts/build-channel-pack.mjs`, `node scripts/build-standalone-channels.mjs`: succeeded, the generated pack is about 2.74 MiB.
- `node scripts/build-standalone-channels.mjs --check`: passed.
- `npm run typecheck`, `npm run typecheck:standalone`: passed.
- `node --check scripts/image-pricing-host-test.mjs`, `node --check src/image-pricing.js`: passed.

- `node scripts/test-all.mjs --mode contributor`: 33/33 passed.
- `git diff --check`: passed.
- `node scripts/test-all.mjs --mode release`: final result 0/3 — manifest, release and catalog did not pass; the new shared pricing file and the modified adapter/pack have not yet been written into the signed manifest, and the catalog revision also needs to be synchronized. The maintainer should update the manifest and signatures following the repository's existing `release-sign` process. This round did not change the trust public key, forge a signature or publish a release.

## Limitations, migration and rollback

Recovery of `/compact` after accumulating 100000 Tokens in a real desktop session was not verified, and no claim is made that already-over-limit historical sessions can be rescued. This round solves the problem that tool results containing images could not execute budgeting and spilling because a pricer was missing.

No UI changes, and no account data or configuration migration. The fallback estimate affects the image Token budget the host displays, but does not change the model modality, the requested image content or vendor billing. Existing native image pricing continues to take priority.

Test dependencies, images, files and logs are all in isolated directories; the official source introduces no host-version dependency. Rolling back this PR and rebuilding the two channel artifacts restores the original behaviour, with no need to delete user data.
