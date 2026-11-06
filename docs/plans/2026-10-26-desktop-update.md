# Desktop Built-in Update Implementation Plan

1. Implement a desktop update manager pinned to the official release source, and wire it into the existing authentication and same-origin management API.
2. Add a native install handoff command: source validation, pinned cache and digest re-verification, service exit, install and restart; no arbitrary command or path execution interface.
3. Add an app update page in the left-hand management area, reusing the existing UI primitives and settings card styles.
4. Write behavioural regression tests covering download and failure states, the install handoff and frontend state; run the type, Rust and applicable full checks, and produce real screenshots.
5. Commit in batches, in Chinese, with reviewable results; this task does not by itself publicly release the desktop build.
