# Plugin upgrade navigation page design

## Goal

Add a "Plugin upgrade" navigation item after "Gateway settings" in the plugin management interface, so users can go directly to the upgrade page. The existing upgrade capability is already implemented; this work only adjusts the entry point and page organisation, so users no longer have to look for the upgrade feature inside the settings page.

## Scope

- Add the navigation item `插件升级` (Plugin upgrade), positioned immediately after `网关设置` (Gateway settings).
- Render the existing upgrade panel independently as the plugin upgrade page.
- Keep the existing version status, check for updates, upgrade now, hot reload, restore backup, upgrade history and automatic-check settings.
- Remove the duplicate upgrade panel from the original settings page, ensuring the feature has a single entry point.
- Keep the Chinese and English navigation text in sync.

## Non-goals

- Do not modify the server-side logic for upgrade download, signature verification, backup restore or hot reload.
- Do not change the existing upgrade interface, permission checks or failure handling.
- Do not adjust the business behaviour of other model, channel or gateway pages.

## Interaction and data flow

Clicking the navigation item updates the current page state and renders the existing `UpgradePanel`. The page obtains the current version, on-disk version, latest version, check time and upgrade history through the existing management API; checking for updates and applying an upgrade continue to use the existing callbacks. After an upgrade completes, the current event notification and page refresh logic is reused.

If the running version and the on-disk version differ, a recovery state exists, or an upgrade request fails, the existing prompts and recovery entry points continue to be shown, with no new bypass handling added.

## Acceptance criteria

1. In the Chinese interface, "插件升级" appears after "网关设置".
2. In the English interface, `Plugin upgrade` is shown in the corresponding position.
3. The settings page no longer renders the upgrade panel a second time.
4. The upgrade page keeps the check, apply, hot reload, automatic check and restore-backup behaviours.
5. The existing upgrade-related tests, client static checks and build checks pass.
6. `git diff --check` passes, and the diff does not include the user's pre-existing README or QR-code changes.

## Risks and rollback

This work only changes the front-end navigation and the component mounting position, so the risk is concentrated in page-state switching and test selectors. To roll back, restore the original navigation list and mount `UpgradePanel` back onto the settings page; the upgrade server side and users' upgrade data are unaffected.
