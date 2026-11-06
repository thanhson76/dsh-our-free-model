# PR #481: Three Bug Fixes Aligned with Upstream

## Scope and Priority

Per the user's final requirements on 2026-10-20: the latest upstream main is the baseline, and only the bugs fixed in this round are merged in. The currently verified baseline is 5923ebef0f55578ca21bb5555b7ba5adb51aef21 (plugin 2.5.6).

The PR's content is now narrowed to the following three items; the earlier full frontend refactoring proposal is not continued:

## Upstream Behaviour Preserved

- The plugin keeps main's 11 page entries, and the sponsor cards remain on the Free models and EAC pages.
- Main's latest sponsor PNG logos, registration links, invitation codes, original card text and direct button access paths are preserved in full.
- The plugin ad-detail entry, the unified banner across all business pages and the standalone-page ad flow all stay as in main; the existing standalone sponsor page and daily announcements follow upstream.
- The README's latest community QR code and image paths, the 2.5.6 release information, and the latest model-usage / Kilo fixes are kept as in main.
- Upstream CI, the release trust root and the signing policy are unchanged. After runtime files change, the formal release record is still prepared by the maintainer via the prepare-release / release-sign flow.

## Handling of the Earlier PR's Regressions

The "background work continues after probing is cancelled" and "keeping the routing page makes the candidate catalogue stale" issues located by the earlier review were both triggered by UI/lifecycle changes added by the earlier full refactoring. This time main's corresponding implementation governs: no misleading cancel button was added, and returning to the routing page re-fetches data following upstream's original lifecycle. Cancelling a manual single-model speed test is one of this round's three fixes, and has been verified in standalone tests and in the real native program.

## Integration Method

The original PR's history is kept, with integration commits appended after it; the file result is based on the original fix candidate d865684 developed from the latest main. The PR's final diff is reviewed against the current main, and the old PR's full refactoring will not be merged in as an extra diff. History was not rewritten or force-pushed, and nothing was merged into the mainline.

## Verification and Boundaries

The original PR candidate already has offline regression, a browser matrix and real-program verification via Windows Computer Use; see docs/testing/2026-10-20-four-fixes-native-validation.md for details. This update removes the UI downgrade feature as the user requested and keeps the other three fixes; verification after the change is governed by the current execution results.
