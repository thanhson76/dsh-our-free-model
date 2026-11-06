# Completing the channels in the standalone service

## Confirmed requirements

After the split into the DSH plugin and a standalone local app, both continue to provide the original anonymous, Kilo, EAC and thirteen account channels. The existing sign-in, account rotation, model toggles, credit locking, automatic check-in and ledger behaviour is retained. The standalone web pages provide channel and EAC entry points that can actually be operated.

## Implementation boundaries

- The standalone service reuses the business logic of the released channel pack and generates a standalone artefact in which only the platform interfaces are replaced; generation validates the replacement points to avoid silently missing a change. The original plugin channel pack is unchanged.
- Each standalone service instance uses a separate Worker to host the channel business logic, isolating module-level caches, scheduled tasks and sign-in flows. The Worker uses the local credential, model registration, lifecycle and management routing interfaces, and does not load Cordis or DSH.
- All standalone state is explicitly located under OFM_HOME. Globally modifying DSH_HOME, impersonating a host profile or reading DSH credentials is forbidden.
- EAC uses the original packaging and signing, and the original gateway GitHub authorization flow. The standalone entry point explicitly opens its own product's channels, while the plugin keeps its original host determination. Each request injects this instance's user token; the root of trust is unchanged.
- A single local HTTP port and API Key serve all models. Account models use provider/model IDs, and the original message, image, tool and thinking-level conversions are retained.
- The web pages reuse the original ChannelsPage and EacAuth, connecting through a same-origin, authenticated management interface. Scripts and React ship with the package; no CDN is used. Third-party authorization is performed by the user.
- On shutdown, management requests are stopped first, streaming generation is cancelled and the Worker is reclaimed, and only then is the data-directory lock released.
- The HTTP mount does not wait for the account-model catalog; once the Worker is ready, the catalog is collected in the background. `--no-refresh` only disables the core catalog's periodic task; the original account sign-in polling, renewal and check-in follow each channel's own rules.
- Add pages for channel usage, the request log, provider toggles, permanent credit locking, nicknames, account priority, rate-limit reset and backup. A plugin backup can only be imported manually by the user; host credentials cannot be read automatically.

## Acceptance

Verify in isolation that loading has no DSH import; that the thirteen real adapters and RPCs register; account state, disabled models, credit locking and local credential persistence; EAC sign-in, cancellation, sign-out and signed-token isolation; the unified model catalog and Chat/Responses streaming tool calls; and no background writes after shutdown. Use a local stand-in to verify the network path without calling real account upstreams. Run the contributor regression for the original plugin channels and EAC in full. Capture web-page screenshots, and state explicitly which parts involving real external sign-in were not verified.
