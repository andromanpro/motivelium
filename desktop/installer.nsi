; -*- coding: utf-8 -*-
Unicode true
; Windows requests UAC before running install/upgrade and this uninstaller.
; The editor has its own asInvoker manifest and is launched separately via Start.
RequestExecutionLevel admin
SetCompressor zlib
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "StrFunc.nsh"
${UnStrStr}
!ifndef PAYLOAD
 !error "PAYLOAD, GENERATED, OUTPUT and ART must be defined by build-installer.py"
!endif
!ifdef UNINSTALLER_OUTPUT
 ; Copy the real compiler-generated PE for offline manifest verification.
 !uninstfinalize '"${BUILD_PYTHON}" "${CAPTURE_SCRIPT}" "%1" "${UNINSTALLER_OUTPUT}"' = 0
!endif
!ifndef MV_VERSION
 !error "MV_VERSION and MV_FILE_VERSION must be defined by build-installer.py"
!endif
!ifndef MV_FILE_VERSION
 !error "MV_FILE_VERSION must be defined by build-installer.py"
!endif
Name "Motivelium ${MV_VERSION}"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Motivelium"
BrandingText "Motivelium · ${MV_VERSION}"
VIProductVersion "${MV_FILE_VERSION}"
VIAddVersionKey /LANG=1049 "ProductName" "Motivelium"
VIAddVersionKey /LANG=1049 "FileDescription" "Установка Motivelium ${MV_VERSION}"
VIAddVersionKey /LANG=1033 "FileDescription" "Motivelium ${MV_VERSION} Setup"
VIAddVersionKey /LANG=1033 "ProductName" "Motivelium"
VIAddVersionKey /LANG=1033 "FileVersion" "${MV_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "2026 Motivelium contributors · MIT"
VIAddVersionKey /LANG=1049 "FileVersion" "${MV_VERSION}"
VIAddVersionKey /LANG=1049 "LegalCopyright" "2026 Motivelium contributors · MIT"
!define MUI_ICON "${ART}\Motivelium.ico"
!define MUI_UNICON "${ART}\Motivelium.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${GENERATED}\welcome.bmp"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Motivelium"
!define MUI_WELCOMEPAGE_TEXT "$(MVText1)"
!insertmacro MUI_PAGE_WELCOME
!define MUI_LICENSEPAGE_TEXT_TOP "$(MVText2)"
!insertmacro MUI_PAGE_LICENSE "${PAYLOAD}\LICENSE"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "$(MVText3)"
!define MUI_FINISHPAGE_TEXT "$(MVText4)"
!insertmacro MUI_PAGE_FINISH
!define MUI_UNCONFIRMPAGE_TEXT_TOP "$(MVText5)"
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Russian"
LangString MVText1 1049 "ИИ собирает видео, человек шлифует результат.$\r$\n$\r$\nУстановка для текущей учётной записи с подтверждением UAC. Node.js и библиотеки уже включены.$\r$\n$\r$\nПроекты хранятся отдельно от программы. Обновление и удаление приложения сохраняют ваши данные.$\r$\n$\r$\nВерсия ${MV_VERSION}."
LangString MVText1 1033 "AI video creation with manual refinement.$\r$\n$\r$\nInstalls for the current account with UAC confirmation. Node.js and libraries are included.$\r$\n$\r$\nProjects are stored separately. Upgrades and uninstalling preserve your data.$\r$\n$\r$\nVersion ${MV_VERSION}."
LangString MVText2 1049 "Собственный код Motivelium — MIT. Условия сторонних компонентов находятся в THIRD_PARTY.md и папке licenses."
LangString MVText2 1033 "Motivelium code is MIT licensed. Third-party terms are in THIRD_PARTY.md and the licenses folder."
LangString MVText3 1049 "Motivelium установлен"
LangString MVText3 1033 "Motivelium is installed"
LangString MVText4 1049 "После завершения откройте Motivelium из меню «Пуск». Редактор запускается с обычными правами.$\r$\n$\r$\nДля работы нужен Microsoft WebView2 Runtime. Для импорта медиа требуется FFprobe; для MP4 — FFmpeg, FFprobe и Chrome. Эти инструменты устанавливаются отдельно.$\r$\n$\r$\nБыстрый старт и диагностика — в папке программы."
LangString MVText4 1033 "Open Motivelium from the Windows Start menu. The editor runs with ordinary user rights.$\r$\n$\r$\nMicrosoft WebView2 Runtime is required. Media import needs FFprobe; MP4 export needs FFmpeg, FFprobe and Chrome. Install these tools separately.$\r$\n$\r$\nQuick start and diagnostics are included."
LangString MVText5 1049 "Будут удалены файлы программы и ярлыки. Проекты, настройки, импортированные материалы и журналы в папке данных сохранятся."
LangString MVText5 1033 "Program files and shortcuts will be removed. Projects, settings, imported assets and logs in the data folder will be preserved."
LangString MVText6 1049 "Не удалось записать файл: $FailedFile. Установка не завершена. Данные проектов не изменены."
LangString MVText6 1033 "Could not write: $FailedFile. Installation did not finish. Project data is unchanged."
LangString MVText7 1049 "Сначала закройте установленный Motivelium, затем повторите операцию. Проекты не изменены."
LangString MVText7 1033 "Close the installed Motivelium and try again. Projects are unchanged."
LangString MVText8 1049 "Нужна 64-разрядная Windows 10 или 11."
LangString MVText8 1033 "64-bit Windows 10 or 11 is required."
LangString MVText9 1049 "Нужна Windows 10 или 11."
LangString MVText9 1033 "Windows 10 or 11 is required."
LangString MVText10 1049 "Установите Microsoft .NET Framework 4.8: https://dotnet.microsoft.com/download/dotnet-framework/net48 . Затем повторите установку Motivelium."
LangString MVText10 1033 "Install Microsoft .NET Framework 4.8 from https://dotnet.microsoft.com/download/dotnet-framework/net48 and run this setup again."
LangString MVText11 1049 "Windows не разрешает запись в меню «Пуск» этой учётной записи даже после подтверждения прав. Установка остановлена; файлы программы ещё не изменены."
LangString MVText11 1033 "Windows denied access to this account Start menu after elevation. Setup stopped before changing program files."
LangString MVText12 1049 "Windows не разрешает регистрацию программы для этой учётной записи даже после подтверждения прав. Установка остановлена; файлы программы ещё не изменены."
LangString MVText12 1033 "Windows denied registration for this account after elevation. Setup stopped before changing program files."
LangString MVText13 1049 "Программа и ярлык в меню «Пуск»"
LangString MVText13 1033 "Program and Start menu shortcut"
LangString MVText14 1049 "Выберите пустую папку или папку установленного Motivelium. Содержимое выбранной папки не изменено."
LangString MVText14 1033 "Choose an empty folder or an existing Motivelium installation. The selected folder has not been changed."
LangString MVText16 1049 "Не удалось создать ярлыки в меню «Пуск». Проверьте права на папку. Данные проектов не изменены."
LangString MVText16 1033 "Could not create Start menu shortcuts. Check folder access. Project data is unchanged."
LangString MVText17 1049 "Не удалось зарегистрировать программу в Windows. Данные проектов не изменены."
LangString MVText17 1033 "Could not register the application in Windows. Project data is unchanged."
LangString MVText18 1049 "Ярлык на рабочем столе"
LangString MVText18 1033 "Desktop shortcut"
LangString MVText19 1049 "Папка не совпадает с зарегистрированной установкой Motivelium. Файлы не удалены."
LangString MVText19 1033 "This folder does not match the registered Motivelium installation. No files were removed."
Var RegistryKey
Var MenuGroup
Var QA
Var MenuRoot
Var FailedFile

Function FailFile
 FileOpen $R8 "$INSTDIR\installation-error.txt" w
 FileWrite $R8 "Cannot extract: $FailedFile"
 FileClose $R8
 MessageBox MB_OK|MB_ICONSTOP "$(MVText6)" /SD IDOK
 SetErrorLevel 17
 Abort
FunctionEnd

!macro CheckRunning PREFIX
 System::Call 'kernel32::OpenMutexW(i 0x100000, i 0, w "Local\Motivelium.Installed.Alpha") p .r0'
 ${If} $0 != 0
  System::Call 'kernel32::CloseHandle(p r0)'
  MessageBox MB_OK|MB_ICONEXCLAMATION "$(MVText7)" /SD IDOK
  SetErrorLevel 10
  Quit
 ${EndIf}
!macroend

Function .onInit
 !insertmacro MUI_LANGDLL_DISPLAY
 SetShellVarContext current
 SetRegView 64
 StrCpy $RegistryKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\Motivelium"
 StrCpy $MenuGroup "Motivelium"
 StrCpy $QA "false"
 ${GetParameters} $R0
 ${GetOptions} $R0 "/LANG=" $R2
 ${If} $R2 == "en"
  StrCpy $LANGUAGE 1033
 ${ElseIf} $R2 == "ru"
  StrCpy $LANGUAGE 1049
 ${EndIf}
 ClearErrors
 ${GetOptions} $R0 "/QA" $R1
 ${IfNot} ${Errors}
  StrCpy $RegistryKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\Motivelium-QA"
  StrCpy $MenuGroup "Motivelium QA"
  StrCpy $QA "true"
 ${EndIf}
 ${IfNot} ${RunningX64}
  MessageBox MB_OK|MB_ICONSTOP "$(MVText8)" /SD IDOK
  SetErrorLevel 11
  Quit
 ${EndIf}
 ${IfNot} ${AtLeastWin10}
  MessageBox MB_OK|MB_ICONSTOP "$(MVText9)" /SD IDOK
  SetErrorLevel 11
  Quit
 ${EndIf}
 ReadRegDWORD $R0 HKLM "SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" "Release"
 ${If} $R0 < 528040
  MessageBox MB_OK|MB_ICONSTOP "$(MVText10)" /SD IDOK
  SetErrorLevel 12
  Quit
 ${EndIf}
 !insertmacro CheckRunning install
 ${If} $QA != "true"
  ; Check Windows integration before extracting or replacing a single app file.
  ; The probe is a unique temporary file/key, never an existing user entry.
  System::Call 'kernel32::GetCurrentProcessId() i .r2'
  StrCpy $R3 "$SMPROGRAMS\.Motivelium-Install-Check-$R2.tmp"
  ClearErrors
  FileOpen $R4 $R3 w
  ${If} ${Errors}
   MessageBox MB_OK|MB_ICONSTOP "$(MVText11)" /SD IDOK
   SetErrorLevel 16
   Quit
  ${EndIf}
  FileWrite $R4 "Motivelium installation access check"
  FileClose $R4
  Delete $R3
  StrCpy $R3 "$RegistryKey.AccessCheck.$R2"
  ClearErrors
  WriteRegStr HKCU $R3 "Check" "$R2"
  ReadRegStr $R4 HKCU $R3 "Check"
  DeleteRegKey HKCU $R3
  ${If} $R4 != $R2
   MessageBox MB_OK|MB_ICONSTOP "$(MVText12)" /SD IDOK
   SetErrorLevel 15
   Quit
  ${EndIf}
 ${EndIf}
 ; NSIS applies an explicit /D= before this callback. Reuse registration only
 ; when there is no explicit destination, to keep unattended QA isolated.
 ReadRegStr $R0 HKCU $RegistryKey "InstallLocation"
 ${If} $R0 != ""
 ${AndIf} $INSTDIR == "$LOCALAPPDATA\Programs\Motivelium"
  StrCpy $INSTDIR $R0
 ${EndIf}
FunctionEnd

Section "$(MVText13)" Core
 SectionIn RO
 !insertmacro CheckRunning install
 ; Never merge the application into an unrelated nonempty directory.
 IfFileExists "$INSTDIR\installed.json" recognized
 IfFileExists "$INSTDIR\.motivelium-folder" recognized
 IfFileExists "$INSTDIR\*.*" 0 recognized
 MessageBox MB_OK|MB_ICONSTOP "$(MVText14)" /SD IDOK
 SetErrorLevel 13
 Abort
 recognized:
 ; Fail explicitly instead of skipping a locked/unwritable runtime file.
 SetOverwrite try
 !include "${GENERATED}\files.nsh"
 FileOpen $R0 "$INSTDIR\installed.json" w
 FileWrite $R0 '{$\"format$\":$\"motivelium-installed$\",$\"version$\":$\"${MV_VERSION}$\",$\"qa$\":$QA}'
 FileClose $R0
 WriteINIStr "$INSTDIR\language.ini" "Motivelium" "Language" "$LANGUAGE"
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 StrCpy $MenuRoot "$SMPROGRAMS\$MenuGroup"
 ${If} $QA == "true"
  ; Explicit QA uses a private shell target and receipt, never the user's HKCU
  ; or Start menu. The ordinary Windows integration branch remains separate.
  StrCpy $MenuRoot "$INSTDIR\qa-shell\StartMenu"
 ${EndIf}
 ClearErrors
 CreateDirectory "$MenuRoot"
 SetOutPath "$INSTDIR"
 CreateShortcut "$MenuRoot\Motivelium.lnk" "$INSTDIR\Motivelium.exe" "" "$INSTDIR\Motivelium.exe" 0
 Delete "$MenuRoot\Удалить Motivelium.lnk"
 CreateShortcut "$MenuRoot\Uninstall Motivelium.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
 ${If} ${Errors}
  MessageBox MB_OK|MB_ICONSTOP "$(MVText16)" /SD IDOK
  SetErrorLevel 16
  Abort
 ${EndIf}
 ${If} $QA == "true"
  WriteINIStr "$INSTDIR\qa-installation.ini" "Motivelium" "InstallLocation" "$INSTDIR"
  WriteINIStr "$INSTDIR\qa-installation.ini" "Motivelium" "DisplayVersion" "${MV_VERSION}"
  Goto integration_done
 ${EndIf}
 ClearErrors
 WriteRegStr HKCU $RegistryKey "DisplayName" "$MenuGroup 0.1 alpha"
 WriteRegStr HKCU $RegistryKey "DisplayVersion" "${MV_VERSION}"
 WriteRegStr HKCU $RegistryKey "InstallLocation" "$INSTDIR"
 WriteRegStr HKCU $RegistryKey "DisplayIcon" "$INSTDIR\Motivelium.exe,0"
 WriteRegStr HKCU $RegistryKey "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
 WriteRegStr HKCU $RegistryKey "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
 WriteRegStr HKCU $RegistryKey "Publisher" "Motivelium contributors"
 WriteRegDWORD HKCU $RegistryKey "NoModify" 1
 WriteRegDWORD HKCU $RegistryKey "NoRepair" 1
 WriteRegDWORD HKCU $RegistryKey "EstimatedSize" ${SIZE_KB}
 ; An install is successful only if Windows registration can be read back.
 ReadRegStr $R0 HKCU $RegistryKey "InstallLocation"
 ${If} $R0 != $INSTDIR
  FileOpen $R1 "$INSTDIR\installation-error.txt" w
  FileWrite $R1 "Registration failed: key=$RegistryKey read=$R0 target=$INSTDIR startmenu=$SMPROGRAMS user=$PROFILE"
  FileClose $R1
  MessageBox MB_OK|MB_ICONSTOP "$(MVText17)" /SD IDOK
  SetErrorLevel 15
  Abort
 ${EndIf}
 integration_done:
SectionEnd

Section /o "$(MVText18)" Desktop
 ${If} $QA != "true"
  CreateShortcut "$DESKTOP\$MenuGroup.lnk" "$INSTDIR\Motivelium.exe" "" "$INSTDIR\Motivelium.exe" 0
 ${Else}
  CreateShortcut "$INSTDIR\qa-shell\Desktop.lnk" "$INSTDIR\Motivelium.exe" "" "$INSTDIR\Motivelium.exe" 0
 ${EndIf}
SectionEnd

Function un.onInit
 ReadINIStr $LANGUAGE "$INSTDIR\language.ini" "Motivelium" "Language"
 SetShellVarContext current
 SetRegView 64
 StrCpy $RegistryKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\Motivelium"
 StrCpy $MenuGroup "Motivelium"
 StrCpy $QA "false"
 FileOpen $R0 "$INSTDIR\installed.json" r
 IfErrors un_bad
 FileRead $R0 $R1
 FileClose $R0
 ${UnStrStr} $R0 $R1 '$\"format$\":$\"motivelium-installed$\"'
 ${If} $R0 == ""
  Goto un_bad
 ${EndIf}
 ${UnStrStr} $R0 $R1 '$\"qa$\":true'
 ${If} $R0 != ""
  StrCpy $RegistryKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\Motivelium-QA"
  StrCpy $MenuGroup "Motivelium QA"
  StrCpy $QA "true"
 ${EndIf}
 ${If} $QA == "true"
  ReadINIStr $R0 "$INSTDIR\qa-installation.ini" "Motivelium" "InstallLocation"
 ${Else}
  ReadRegStr $R0 HKCU $RegistryKey "InstallLocation"
 ${EndIf}
 ; A failed first installation can have a valid marker and files but no HKCU
 ; registration. Let its own uninstaller remove only known files. A different
 ; registered installation is still protected from this copy's uninstaller.
 ${If} $R0 != $INSTDIR
 ${AndIf} $R0 != ""
  Goto un_bad
 ${EndIf}
 ${If} $R0 == ""
 ${AndIf} $QA == "true"
  Goto un_bad
 ${EndIf}
 !insertmacro CheckRunning uninstall
 Return
 un_bad:
 MessageBox MB_OK|MB_ICONSTOP "$(MVText19)" /SD IDOK
 SetErrorLevel 14
 Quit
FunctionEnd

Section "Uninstall"
 !insertmacro CheckRunning uninstall
 !include "${GENERATED}\uninstall-files.nsh"
 Delete "$INSTDIR\language.ini"
 Delete "$INSTDIR\installed.json"
 Delete "$INSTDIR\.motivelium-folder"
 Delete "$INSTDIR\Uninstall.exe"
 ${If} $QA == "true"
  Delete "$INSTDIR\qa-shell\StartMenu\Motivelium.lnk"
  Delete "$INSTDIR\qa-shell\StartMenu\Uninstall Motivelium.lnk"
  Delete "$INSTDIR\qa-shell\StartMenu\Удалить Motivelium.lnk"
  Delete "$INSTDIR\qa-shell\Desktop.lnk"
  RMDir "$INSTDIR\qa-shell\StartMenu"
  RMDir "$INSTDIR\qa-shell"
  Delete "$INSTDIR\qa-installation.ini"
 ${Else}
  Delete "$SMPROGRAMS\$MenuGroup\Motivelium.lnk"
  Delete "$SMPROGRAMS\$MenuGroup\Uninstall Motivelium.lnk"
  Delete "$SMPROGRAMS\$MenuGroup\Удалить Motivelium.lnk"
  RMDir "$SMPROGRAMS\$MenuGroup"
  Delete "$DESKTOP\$MenuGroup.lnk"
  DeleteRegKey HKCU $RegistryKey
 ${EndIf}
 ClearErrors
 RMDir "$INSTDIR"
 ${If} ${Errors}
  ; Unknown user files stay. A small ownership marker permits reinstalling
  ; into this known folder without accepting arbitrary nonempty directories.
  FileOpen $R0 "$INSTDIR\.motivelium-folder" w
  FileWrite $R0 "Motivelium preserved folder, format 1"
  FileClose $R0
 ${EndIf}
SectionEnd
