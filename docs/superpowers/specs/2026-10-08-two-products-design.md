# Two-product split: phase-one design and implementation scope

## Confirmed goal

Maintain two separate products: the DSH plugin and a local service that needs no DSH installation. The two products share the model business code,
and each has its own startup entry point, data directory, credentials and lifecycle. The plugin does not depend on the standalone service over HTTP,
and the standalone service does not borrow a simulated Cordis context to start the plugin.

Phase one extracts the shared runtime core and provides an executable basic entry point for the local service. Web management, decoupling of the account channels,
the desktop wrapper and the two-product release process are later phases and are not part of this implementation.

## Current layout

| Path | Responsibility |
| --- | --- |
| Root `package.json`, `index.js`, `client.js` | The existing DSH plugin package and compatibility entry points |
| `src/core/runtime.js` | Shared store creation, roster refresh, availability probing, egress monitoring, model runtime |
| `src/core/completion.js` | Shared OpenAI request conversion, model admission, streaming calls and result aggregation |
| `packages/standalone/package.json` | The standalone service product's name, version and entry point |
| `packages/standalone/service.mjs` | Service orchestration, standalone directory, API Key, HTTP listening and shutdown |
| `packages/standalone/cli.mjs` | The standalone service command-line launcher |

For now, the existing plugin entry points and assets are not moved wholesale into `packages/dsh-plugin`. The existing updater, signed manifest,
directory records and installed clients fetch artefacts using the repository-root layout, so that layout is kept for now. The shared core lives under `src`,
so the existing plugin's `files` distribution range includes it, and users are not required to install the other product at the same time.
At this stage the standalone service needs the full source repository; a later build step will bundle the shared modules into its own artefact.

## Core interfaces

`createRuntimeStores({ dataDir, logger })` explicitly receives the product data directory and creates separate stores for settings,
statistics, the roster cache and probe results; the initial objects are deep-copied so instances in the same process do not share mutable defaults.

`createModelRuntime(...)` receives the stores above, plus logging, image parsing, an optional EAC credential callback and
a topology notification callback. The core does not resolve host services and does not load DSH modules.

The runtime provides interfaces for model state, adapters, refreshing the roster, refreshing probes, monitoring egress, inference requests and destruction.
Creation itself makes no network requests; each of the two products decides its own startup and scheduled-refresh timing.
Streaming model requests, thinking budgets, tool calls, recovery and statistics reuse the existing implementation.

## Product boundaries

The plugin keeps `{ name, inject, apply }`, the model picker, model discovery, the settings page and management API,
DSH image parsing, the EAC host gate, account-channel mounting, self-update and hot reload. The existing data paths are unchanged.

The standalone service directly creates the shared runtime and an OpenAI-compatible listener. Its default data directory is `~/.our-free-model`,
which can be overridden by `OFM_HOME` or the command line. The default port is `18900`, the key is generated separately, and the model roster and inference interfaces
require that key; the health interface only reports the product, version and capability flags, and returns no user data.

The standalone entry point does not load the plugin entry point, host adapter modules, EAC sealed credentials or the vendored account channel pack.
Asynchronous roster refresh is on by default, but inference probing is not enabled. A directory lock prevents two standalone instances from writing the same data directory at once.
A normal shutdown first terminates runtime tasks, then closes HTTP, flushes the stores and releases the directory lock.

## Compatibility and validation

The plugin's public export `fromOpenAiMessages` is re-exported from the new shared module to keep existing consumers compatible.
The existing forwarding health response stays unchanged by default; the standalone entry point injects its own health response.

Validation includes:

1. The existing plugin's full contributor suite, type checking and diff checking.
2. Real local HTTP tests of the standalone service, including non-streaming, streaming, Responses, Kilo and authentication.
3. Cache restart, merged roster refresh, no writes after cancellation, no follow-up requests sent, and listener release after shutdown.
4. Forbidding plugin and DSH modules from loading in a separate Node child process, verifying host-free operation.
5. Release-manifest coverage of the new shared files; re-signing through the key-holder process is still required before an actual release.

## Subsequent order

Shared interface and standalone management API → decoupling of account-channel storage and registration → build artefacts for each product →
separate version numbers, update sources and release workflows → desktop shell.

The two products' release and update manifests are maintained separately. This work generates no fake signatures, does not modify the root of trust, and publishes no Release.
