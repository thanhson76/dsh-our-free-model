# Issue #30 Heatmap Fix Decision

## Goal and constraints

- Fix the phenomenon in the desktop settings where the daily cells are stretched apart horizontally.
- Use the existing 12px cells, theme variables, four-step colour scale and tooltips.
- Keep the 17-week view promised in the README; each column starts on Sunday and ends today, with no future dates generated.
- Use the local calendar, consistent with the stored `dayKey`; no dates are lost across months, years or daylight-saving changes.
- When there are no records, show the existing hint; dates recorded with zero tokens can still display the calendar.
- Add no runtime dependencies, network requests or data storage; the maintainer accepts the change through the existing offline test runner.

## Evidence and choice

The Grid's implicit column width is currently `auto`, so leftover width stretches the tracks while the cells stay 12px.
In Chromium, the horizontal blank space inside a cell in a 560px panel is about 19px; removing `gap` cannot eliminate the blank space inside the tracks.

Setting only `justify-content:start` removes the stretching; this change also pins the row and column sizes to 12px,
so the grid and the cells stay consistent, while narrow containers keep horizontal scrolling.

The original date expression cannot reliably start on Sunday. This change first determines the Sunday of the current week, then goes back 16 weeks from it,
displaying 17 columns and 113 to 119 dates in total. All dates are advanced with the local `setDate`,
anchored at local noon, to avoid dropping the last day when daylight saving switches at midnight.

`buildHeatCells([])` originally still generated zero-value cells, making the existing empty-state branch unreachable.
This change makes record-free input return an empty array, so zero-token records are not mistaken for no records.

## Verification

`scripts/heatmap-test.mjs` covers, through the real client test seam, the seven days of a week, year boundaries, leap days,
the Shanghai and New York time zones, daylight saving, consecutive dates, data projection, the empty state, zero-value records and tooltips.
A temporary Chromium reproduction page additionally checks cell spacing and narrow-container scrolling; before release, the signed manifest still needs to be updated
with the release private key as described in RELEASING.md.

This heatmap's 40 checks, the client lint and the announcement sanitizer checks all pass.
Chromium keeps a 12px row/column stride and zero inter-column blank space in 160/320/560/900px panels,
and the 160px panel retains horizontal scrolling. The signed manifest check fails because the `client.js` digest changed;
`OFM_MANIFEST_KEY` is not configured in the current environment, so release signing is left for the maintainer to complete.

![Before-and-after comparison of the component fix](images/heatmap-layout-before-after.png)

The screenshot uses an isolated reproduction of the component with the current CSS and sample data, and does not represent acceptance in a real DSH host.
Contributors have no release signing authority; before merging into main, the maintainer must rebuild and sign the release manifest,
sync the catalog integrity records, and refresh the source revision as described in the release documentation.
