# Sponsor Advertisement Entry and Daily Announcement

This change adds a sponsor advertisement page and a full announcement shown once a day; it does not change inference, account, gateway or login behaviour.

## UI Preview

![Announcement in the plugin, desktop light and desktop dark](images/sponsor-ui-preview.jpg)

## Display Locations

- DSH plugin: a "Ads from sponsors" item is added to the top menu, leading to the long-form page.
- Standalone service and desktop: an entry of the same name is added under "Project support" on the left. Narrow windows reuse the existing horizontal menu.
- The plugin inherits the host's colour scheme; the desktop build adapts separately to the light paper and dark terminal themes.
- The full announcement's body scrolls separately, and the close button in the header and "Collapse to menu" at the bottom are always available.
- When collapsing, the menu is first brought into the visible area, then the announcement shrinks towards that menu and briefly highlights the entry. When the system is set to reduce motion, it collapses immediately.
- Esc and clicking the overlay also collapse it immediately; there is no countdown, no reading-progress requirement and no automatic external redirect.

## The Once-a-Day Boundary

After the UI is first opened successfully, it waits 700ms before trying to show it; it does not pre-empt the login screen, background windows or other existing modal windows.
The host settings dialog in which the plugin sits does not count as something to avoid; a business dialog opened separately within the same settings page still has to be closed before the announcement is shown.
While the announcement is open, Esc only collapses the announcement and returns focus to the ad menu; it does not trigger the host settings page's Esc close behaviour.
"Today" is judged by the device's local year, month and day, not the UTC date. The record key is `ofm.sponsor.last-shown.v1`, and the record is kept only after the announcement has been opened successfully.
Refreshes, page switches, component re-mounts and multiple same-origin windows all reuse the record; browsers supporting Web Locks serialise display across concurrent windows.
When the browser does not allow reading or writing local storage, the automatic announcement is skipped and only the ad menu is kept, avoiding a pop-up on every refresh.

The record belongs to the current browser/desktop app's data environment and site address. Different browsers, different ports, different desktop profiles and cleared site data each have their own first record.
If the UI stays open across midnight, nothing suddenly pops up mid-operation; the next time the UI is entered or returned to, it is judged against the new date.

## Content and Resources

- `src/sponsor.js`: the original text, registration link, invitation code, group number, date rules and shared React components.
- `src/sponsor.css`: shared typography and the three visual adaptations.
- `docs/images/sponsor-beichen-examples.jpg`: the original attached image provided by the user.
- `scripts/build-sponsor.mjs`: inlines the shared components, styles and attached image into the plugin's `client.js`. The attached image does not depend on an external image host.
- `packages/standalone/frontend/sponsor.tsx`: the standalone build uses the same components and image.

The registration link actually uses a standard half-width question mark, and the invitation code is `DL49WAC2DQNG`; external links open only after the user actively clicks.
The image is shown as the provided generated example and carries no independently verified claims.

After changing the content, run:

```powershell
node scripts/build-sponsor.mjs
node scripts/build-standalone-ui.mjs
node scripts/sponsor-test.mjs
npm run typecheck:standalone
```

The standalone build synchronously updates the plugin's inlined components; `--check` only checks consistency and writes no files.
The automatic offline tests include the daily-rule tests. The real-browser test is `node scripts/sponsor-ui-test.mjs`, which can be pointed at an existing Playwright module via `OFM_PLAYWRIGHT_MODULE`, at a browser via `OFM_BROWSER_PATH`, and at a screenshot directory via `OFM_SPONSOR_OUTPUT`.

This change only updates the source and web build files; no Windows EXE or installer was regenerated, and no new release signature was produced.
