# Gateway Tool-Message Compatibility Between Old and New Kernels

Both Chat's `role: tool` and Responses' `function_call_output` must be converted into the current host's tool-result message. DSH ≤0.1.6 uses a `tool-result` block inside a `user` message, while 0.1.7+ uses a top-level `tool` message carrying a `toolCallId`. External providers do not pass through channel-pack's message normalisation layer, so always emitting either one format would break tool calls on the other kernel generation.

The gateway's shared entry point `createGatewayToolMessage()` delegates these differences to the host-exported `createToolResultMessage()`; content blocks, call IDs, message IDs and source are all carried by the existing host contract. Chat and Responses continue to share the inbound image logic. The assertions on `isError` cover an internal helper; they do not mean a new OpenAI inbound `is_error` extension was added.

## Regression checks

```powershell
npm ci --ignore-scripts
node scripts/gateway-source-test.mjs
npm run test:contributor
npm run typecheck
```

The gateway checks are included in `test:contributor` and need no model credentials or network calls. The tests separately load the pinned, real old-kernel package `dsh-llm-legacy` (`@deepseek-ai/dsh-llm@0.1.5-rc.2`) and the project's installed current host; they run the conversion for both endpoints against the TypeScript sources and the committed `pack.js` respectively, and check:

- the host message role, tool call ID and result text;
- that parallel tool calls and results with images remain fully paired after the existing serialiser;
- that the helper's error flag, system message source, thinking pass-back and ordinary history stay correct.

The old host's development dependency is pinned to `0.1.5-rc.2` from the same batch, to avoid a later `rc.3` tightening the Cordis peer range and making the two test kernels conflict. That alias is for tests only and is not bundled into the runtime.

After modifying the vendored sources, run `node scripts/build-channel-pack.mjs` to regenerate the package; the gateway regression also catches the case where the source is fixed but the generated package was not updated.

The standalone side provides a message factory of the same name through `channels/contracts.mjs`, and syncs the business artifact with `node scripts/build-standalone-channels.mjs`. `node scripts/standalone-channels-test.mjs` checks that the artifact's two endpoints still preserve tool IDs and results; `node scripts/build-standalone-channels.mjs --check` checks that it is consistent with the channel pack, avoiding a rebuild that loses the factory export or keeps running old conversion code.

These checks prove the message-conversion and local serialisation behaviour; they are no substitute for acceptance against a real remote model or a full desktop host. The signed release manifest and `release-readiness` are still prepared by the key-holding maintainer following the [contributor and release signing process](contributor-ci-signing.md).
