# Issue 590: Visual Effects Toggle and Local Performance Comparison

## Environment and method

- Local machine: macOS 15.0, Apple M1 Pro (14-core GPU), Retina screen; not the issue reporter's Windows Iris Xe environment.
- After the user opened the native DSH settings window, the comparison was carried out on the actually installed plugin page; the local installer package is recorded as 2.5.8, only the frontend files were replaced and loaded through the plugin's built-in hot reload, and the backend was not upgraded.
- In local Chrome, the same window, the same 1200×711 CSS pixel viewport, the same real React 19.1.1 preview shell and a local stand-in backend were used. The original used the real `client.js` of the locally installed 2.5.8; its CSS is identical to 2.5.9. The candidate used the real frontend files from the workspace.
- Each group was sampled at rest for 30 seconds, reading whole-machine GPU once per second via IOAccelerator's `Device Utilization %`; Chrome's whole process-group CPU was counted from the difference in cumulative process CPU time, while RSS and WindowServer were also recorded. CPU percentages take a single core as 100%; they are not whole-machine CPU percentages.
- The GPU includes other background applications and cannot be attributed directly as a plugin-only value; the causal direction was checked by repeated on/off tests with the same candidate frontend. Each group kept the state of other applications unchanged and did not run generation requests as the measurement load.

## Isolated browser comparison

| State | GPU mean | GPU median | Chrome process-group CPU mean | Chrome RSS mean |
| --- | ---: | ---: | ---: | ---: |
| Original page | 71.50% | 72% | 65.45% | 773.21 MiB |
| Candidate: effects off | 28.27% | 27% | 51.29% | 784.86 MiB |
| Candidate: effects on | 71.77% | 72% | 67.04% | 807.95 MiB |
| Candidate: off again | 27.77% | 27% | 52.17% | 791.13 MiB |

Compared with the original, the repeated-off group lowered the GPU mean by about 61.2%; turning effects on restored the high load, and turning them off lowered it again. No RSS improvement was observed, so this fix must not be described as a memory optimization. This result verifies the effect of the frontend visual toggle in the local browser; the native DSH results are recorded separately below and do not represent acceptance on Windows Iris Xe.

There was also a 20-second DSH background reference sample: the DSH process group averaged 0.61% CPU and the whole-machine GPU averaged 15.6%. That sample had no visible OFM page; it serves only as background reference and was not used to compute the benefit of the fix.

## Same-machine comparison in native DSH

The Free models page's actual availability was 0%, and the empty aquarium was retained. Each group lasted 30 seconds; the general settings page reference lasted 20 seconds; the native groups count the whole DSH process group, excluding WindowServer.

| State | Whole-machine GPU mean | DSH CPU mean | DSH RSS mean |
| --- | ---: | ---: | ---: |
| First version off (empty tank not yet paused) | 99.90% | 53.79% | 536.75 MiB |
| Final candidate off | 74.87% | 0.47% | 627.35 MiB |
| Final candidate on | 99.60% | 41.72% | 612.72 MiB |
| Final candidate off again | 76.83% | 0.63% | 613.18 MiB |
| General settings page reference (20 seconds) | 71.75% | 0.57% | 505.04 MiB |

In the first version, when only the decorative effects were turned off, the invisible animation in the empty tank still kept the page compositing continuously, with the GPU at about 100%. After the final candidate also paused the empty tank and off-viewport aquarium animations, DSH CPU was below 1% in both off runs and the GPU returned to about 75%–77%; turning the decorative effects back on restored it to about 100%, verifying that the toggle's effect is repeatable. RSS did not improve, and RSS before and after hot reload is not evidence of a memory benefit.

On the general settings page, with no OFM page present, the whole-machine GPU was still about 72%, so the remaining load cannot be attributed to OFM alone. The locally installed wallpaper engine was also found to apply frosted glass to the entire settings window in its code, with a default blur value of 60; this is a possible source of host compositing cost and has not yet been confirmed by a disable-and-compare test. This round did not change the wallpaper engine or other plugin settings.

Native screenshots and raw samples are kept only on the local machine and were not uploaded publicly; the fish and waves when there is water were verified in the isolated preview described above, and the final candidate also has regression checks for the empty tank, leaving the viewport, and resuming.

## Functional verification

- Decorative effects are off by default; when off, there are no full-screen light-spot nodes, and the main panel's computed style is `backdrop-filter: none`.
- The aquarium's water level, accessibility labels and availability are retained; when there is water and it is visible, turning decorative effects off still leaves 3 fish, 5 bubbles, 2 wave layers and the in-tank light animation.
- Native testing exposed the problem that an empty tank still ran invisible animation; handling was added to pause when the tank is empty or the aquarium leaves the viewport, and to continue when it becomes visible again and has water; the regressions cover observer release.
- Turning effects on restores the light-spot nodes and the `blur(18px)` frosted-glass style; turning them off again takes effect immediately, and the toggle stays off after a reload.
- Under a simulated system reduced-motion setting, the aquarium content and the 100% availability label are retained, and the fish's computed style is `animation-name: none`; the simulation was cancelled after the check.
- 360px narrow-screen check: document width 360px, no horizontal overflow, and the toggle was within the visible area; the real viewport was restored after the check.
- New regressions cover off-by-default, toggling, remounting, storage refusal, document visibility, aquarium structure, and not creating animation frames when number scrolling is off.

## Execution results

- `npm run test:contributor`: 78/78 suites passed.
- `node scripts/plugin-bench-ui-test.mjs`: 9 items passed.
- `node scripts/picks-ui-test.mjs`, `node scripts/client-lint.mjs`: passed.
- `npm run typecheck` (adapter), `npm run typecheck:standalone`: passed.
- The standalone frontend was rebuilt; `node scripts/build-standalone-ui.mjs --check`, `node scripts/build-standalone-channels.mjs --check`: passed.
- `node --check client.js`, `git diff --check`: passed.

## Local synchronization and limitations

The original local plugin package is recorded as 2.5.8; this round only backed up and atomically replaced its `client.js`, and the candidate file's SHA-256 matches the workspace; no accounts, credentials, gateway configuration or backend implementation were changed. The backup, raw samples and screenshots stay on the local machine, and no real user data was committed. The final candidate was loaded with the plugin's built-in hot reload, the native-page on, off and off-again comparison was completed, and the off state was kept at the end. No new version was released in this round, and no Windows/macOS installer or real upstream account call was verified.
