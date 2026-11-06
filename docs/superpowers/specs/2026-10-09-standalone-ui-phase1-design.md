# Standalone interface redesign: phase one

## Confirmed scope

The user has confirmed completing the overview, channel management, shared layout and a clickable preview first. React,
TypeScript, Vite, Tailwind, and shadcn-style base components maintained in-project are used.
A light-grey background, white content areas, dark text and a blue accent colour establish the workbench look.
Once phase one is complete, visual and performance evidence is provided, and the other business pages wait for the user's review before being rolled out.

## Structure and compatibility

- Vite generates local ES modules and CSS, the channel module loads dynamically, and a single React is shared.
- The overview uses React components to show real statistics, the connection address, service information and recent errors.
- The channel list gains search, status filtering and a centralised detail view, which reuses the original ChannelCard's sign-in,
  account pool, model toggles, renewal, check-in and credit business logic.
- Usage, the log, provider settings, backup and EAC keep their original business components; hosting styles are unified.
- The un-redesigned model, settings, API connection and sign-in operations keep their existing control logic. A progressive adapter
  provides the management summary to the new React components without rewriting the backend interfaces or the original plugin.
- Only scripts and styles that were actually built are mounted; no arbitrary file-path access is provided.
- Asynchronous loading should handle errors, retries and stale navigation, and after leaving management no previous account state is shown.
- The pages keep the stand-in notice, so a preview account is not mistaken for a real account.

## Pages

Overview: title and refresh action, four metrics, seven days of usage, quick connection, the channel entry point and recent errors.
With no historical data, real zero values and an empty state are shown; no fabricated growth rates or call records are used.

Channel management: the account channels / EAC / anonymous and Kilo entry points are reachable; all thirteen account channels can be searched and filtered.
The channel detail view presents the original business operations centrally, and the usage, log and backup entry points are always reachable.
The pages adapt to desktop and narrow screens, with clear keyboard focus and text contrast.

## Validation and delivery

Record the raw/gzip sizes of all front-end assets before the redesign, and three timings for refreshing in the same browser until the overview becomes visible.
The latter includes automation-tool round trips and is not claimed to be pure rendering time.
The new version uses the same method, adding first/repeat entry into channels and long-list operation results.

Run type checking, generation consistency checks, management and channel special tests, and the contributor regression;
save screenshots of the overview, channels, detail view and narrow screens. Full third-party authorization is performed by the user.
Split across multiple commits in Chinese; publish no Release, create no tag, and bump no version.

## Implementation tasks

1. Baseline and design record.
2. Vite, TypeScript, Tailwind and shared-page build adaptation.
3. Unified shared components, layout and overview.
4. Channel filtering and detail, keeping the shared business logic.
5. Business and asset-loading regression, and actual desktop and narrow-screen acceptance.
6. Size/speed comparison and recording of the verified and unverified scope.
