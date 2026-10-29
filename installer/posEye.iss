; Inno Setup script for posEye Windows Installer
; Compile after: scripts\fetch-ffmpeg.ps1, scripts\build-orchestrator.ps1, apps\desktop npm run dist

#define MyAppName "posEye"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Team ICARUS"
#define MyAppURL "https://github.com/posEye"
#define MyAppExeName "posEye.exe"

[Setup]
AppId={{9C2E4B1A-7D18-4F3A-9B51-A8C0DE4A11C0}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=..\dist-installer
OutputBaseFilename=posEye-Setup-v{#MyAppVersion}
SetupIconFile=..\posEye.ico
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Packaged Electron application
Source: "..\apps\desktop\release\win-unpacked\*"; DestDir: "{app}"; Flags: recursesubdirs
; Bundled static ffmpeg binary (101MB local static build)
Source: "..\third_party\ffmpeg.exe"; DestDir: "{app}\resources"; Flags: ignoreversion
; Standalone Orchestrator API binary (Python PyInstaller)
Source: "..\third_party\orchestrator.exe"; DestDir: "{app}\resources"; Flags: skipifsourcedoesntexist
; NodeODM Docker image archive (offline deployment)
Source: "..\third_party\nodeodm.tar"; DestDir: "{app}\third_party"; Flags: skipifsourcedoesntexist
; Provisioning helper scripts
Source: "..\scripts\provision-docker.ps1"; DestDir: "{app}\scripts"
Source: "..\scripts\detect-virtualization.ps1"; DestDir: "{app}\scripts"
; Docker Desktop installer (optional payload)
Source: "payload\Docker Desktop Installer.exe"; DestDir: "{tmp}"; Flags: skipifsourcedoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\provision-docker.ps1"" -InstallerExe ""{tmp}\Docker Desktop Installer.exe"" -NodeOdmTar ""{app}\third_party\nodeodm.tar"""; StatusMsg: "Configuring NodeODM and container environment..."; Flags: runhidden
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

