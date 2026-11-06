# Standalone service web management: phase two

## Goal and confirmed scope

The user has agreed to proceed with the web management phase. This delivers management pages for the standalone service that can actually be operated:
service status, the model roster, usage statistics, settings and API Key management. The phase-one two-product boundaries are retained.

## Implementation choice

Use local HTML, CSS and JavaScript, served by the standalone service on the same loopback port.
The existing plugin pages depend on the DSH ModuleLoader, React and slots, and cannot run directly as standalone pages.
Introducing React build tooling would increase the installation and packaging cost of the current basic pages, so it is not adopted for now.
The shared statistics aggregation logic is extracted into the core, and the plugin continues to use it through its original exports, avoiding divergent statistics definitions.

## Pages and interaction

1. Overview: running/paused status, API address, model count, request and Token overview, and connection examples.
2. Models: search, channel filtering, capabilities and availability, roster refresh, active probing and single-model testing.
3. Usage: recent daily usage chart, per-model statistics, with physical requests and user turns shown separately.
4. Settings: inference toggle, region-model display, refresh interval, automatic probing, output cap, and stream recovery.
5. API Key: explicit viewing, copying, and rotation after confirmation; the old Key becomes invalid immediately after rotation.

The pages are in Chinese, adapt to narrow screens, and provide loading, empty, error and in-progress states.
The service status and statistics on the first screen come from real interfaces; automatically reading data does not trigger model inference.

## Management interface and authentication

The standalone service provides a separate management interface at `/api/management`, using the core runtime and its own data directory.
The management interface first validates the loopback Host, Origin/Referer and the cross-site marker, and only then validates the management session or API Key.
The management interface is not open to cross-origin use and does not reuse the inference interface's permissive CORS.

The CLI prints a one-time sign-in link for the management page: the temporary credential is placed in the URL fragment and removed
after the page signs in. The temporary credential has an expiry and can be redeemed only once; it is not the inference API Key.
Entering an existing API Key on the sign-in page is also supported. The server exchanges it for a time-limited Cookie with
HttpOnly and SameSite=Strict; the session is kept only in memory and becomes invalid on sign-out or service restart.
Different ports use different Cookie names, so multiple services on the same host do not overwrite each other's sign-in state.

Static assets are served only from a fixed allowlist, with no third-party scripts loaded; dynamic content is rendered as text.
Settings accept only explicitly allowed fields, validate types and ranges, limit the request-body size, and synchronously check the persisted result.
When inference is turned off, the management page can still be accessed and inference re-enabled; a management session cannot be used as a credential for the inference interface.

## Lifecycle and compatibility

The shared forwarding service gains an optional request-handling entry point, keeping the plugin's default flow and health interface compatible.
The standalone service uses that entry point to provide the pages and management API, while bind address, port selection and inference authentication continue to be reused.
After a settings change, automatic refresh is rescheduled; enabled probing still honours the existing 429 backoff.
`--no-refresh` continues to forbid automatic tasks; explicit refreshes and tests on the page are triggered by the user.
Management sessions and temporary sign-in credentials are cleared on sign-out. Existing standalone service data needs no migration.

## Implementation steps and acceptance

1. Extract the shared statistics aggregation and keep the plugin exports.
2. Provide the management session, static assets, and settings/model/statistics/key interfaces, and wire them into the standalone service.
3. Implement the Chinese management pages and update the startup instructions.
4. Verify authentication, cross-site rejection, settings persistence, resuming after a pause, key rotation,
   model operations, statistics and session invalidation on restart through local HTTP tests, while running the existing contributor suite.
5. Start a standalone instance, actually operate it in the browser and capture page screenshots; record test status and interface evidence separately.

Web management does not include EAC authorization, account-channel sign-in, a desktop shell, a service installer or a release process.

## Actual delivery and evidence

The five web management pages and the same-origin management interface have been implemented. For the tests actually run, browser operations, screenshots and
the remaining release-signing items, see the [acceptance record](../../standalone-web-management-verification.md).
