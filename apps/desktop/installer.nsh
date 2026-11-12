; Remove legacy subfolder shortcut from pre-0.1.9 installs so Windows Search uses electron-builder's AppUserModelID shortcut.
!macro customInstall
  Delete "$SMPROGRAMS\posEye\posEye.lnk"
  RMDir "$SMPROGRAMS\posEye"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\posEye\posEye.lnk"
  RMDir "$SMPROGRAMS\posEye"
!macroend
