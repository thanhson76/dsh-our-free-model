; Node and the full license are distributed with the installer; process checks are left to the standard Tauri installer.
; Never force-kills processes by name, never deletes other services' locks, and never overwrites existing configuration.
!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$PROFILE\.our-free-model"
!macroend
