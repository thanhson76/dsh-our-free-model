# Four-Issue Fix Plan and Acceptance Goals (2026-10-20)

> The test counts and native acceptance in this document are the historical record of the original PR candidate. This update has removed the UI downgrade feature as the user requested; see the appended record below for verification after the change.
User authorization: handle all of the first four items, review the existing PRs first, and fill in the gaps on top of the existing proposals.

## Goals and Acceptance

## Division of Work

## Execution Order

1. Check upstream and a clean branch; read the PRs first rather than merging blindly.
2. Implement in parallel along file boundaries; agree on the public interfaces first, then wire them up.
3. Targeted regression for each item; rebuild vendor, the standalone business code and the frontend.
4. Independent review plus one batch pass in a local browser (desktop/mobile, light/dark); fix everything centrally, then confirm.
5. Run the full contributor offline regression, type checks and packaging checks, and produce a re-verification record.

## Design Trade-offs

Real vendor accounts, real-device GPU improvements and formal signing still require evidence from a real environment; this round does not present offline simulation results as if those real-world tests were complete.

## Final Completion Record (2026-10-20)

All four goals were implemented, given targeted checks and independently reviewed. The final contributor offline regression passed 80/80 suites; the real browser passed 15/15 scenarios and 153/153 assertions, with 35 screenshots and 0 page errors / undefined fixture interfaces / external requests. Both of the repository's established type checks passed; the isolated startup of the 86-file standalone source package, all static assets and the management-auth checks passed; and the consistency check between the page's 10 local assets and the business bundle passed.

The follow-up review additionally fixed three edge cases:

The full vendor type check, compared against the upstream baseline in the same environment, still shows exactly the same 21 pre-existing diagnostics, with 0 new ones; it must not be described as the full vendor type check passing.

## User-Requested Native Re-verification and Commit (2026-10-20)

The final collaboratively re-verifiable record is in docs/testing/2026-10-20-four-fixes-native-validation.md. The user authorized committing after re-verification: this fix branch was committed as look-back-lysj <3597536534@qq.com>, with no mainline merge or formal release.

## Verification After Removing the UI Downgrade Feature (2026-10-20)
