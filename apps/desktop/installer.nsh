; Desktop and Start Menu shortcuts use the posEye logo, not the default Electron icon.
!macro customInstall
  IfFileExists "$INSTDIR\resources\posEye.ico" 0 poseye_icon_done
  CreateShortCut "$DESKTOP\posEye.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\resources\posEye.ico" 0
  CreateDirectory "$SMPROGRAMS\posEye"
  CreateShortCut "$SMPROGRAMS\posEye\posEye.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\resources\posEye.ico" 0
  poseye_icon_done:
!macroend
