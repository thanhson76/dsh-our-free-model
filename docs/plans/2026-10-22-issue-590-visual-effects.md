# Issue 590: Local Verification and the Visual Effects Toggle

## Confirmed Scope

The user asked for resource usage to be measured on this machine, then re-measured under the same conditions after the fix; the aquarium feature is kept, and the other visual effects get a one-click toggle.

## Design and Assumptions

- A "Visual effects" toggle is added at the top of the plugin settings page, off by default; turning it on restores the original visual style, taking effect immediately.
- The choice is stored only in the current browser's localStorage; it does not modify account, model, gateway or credential configuration.
- When off, no full-screen light spots are created, and blur, looping animations, decorative sweeps and number rolling outside the aquarium are removed; the aquarium's water level, status, labels, and the fish and waves when visible, are kept.
- CSS animations pause when the page is hidden or leaves the visible area; the aquarium's invisible animations pause when its water level is zero or it scrolls out of the viewport, and resume when there is water and it is visible; the system's "reduce motion" setting takes precedence.
- No new dependencies; the existing React, CSS and browser APIs are used, and everything remains operable when storage is unavailable.
- The performance goal is to lower rendering cost while the same page sits idle on the same machine; no guarantee is made about utilisation percentages on a different GPU model.
- The local GPU counter is whole-device utilisation; the DSH process group's CPU/RSS and WindowServer CPU are recorded at the same time, other applications are kept in a stable state, and the attribution limits are stated.

## Trade-off Record

Decorative effects are off by default with a toggle to restore them, meeting the user's requirement to keep the aquarium and a switchable appearance. Relying solely on the system's reduce-motion setting cannot remove the background blur; deleting all animation outright would lose the aquarium experience the user asked to keep.

## Verification

Record idle samples of the same page on this machine before the change, with effects off and with effects on; check the toggle's immediate effect, persistence across reloads, the aquarium content, the system's reduce-motion setting, storage failures and regression of the original features. The user did not request a new release, so this round does not release one automatically.
