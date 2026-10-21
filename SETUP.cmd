@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24.12 or newer in the 24.x series from nodejs.org, then reopen this folder.
  pause
  exit /b 1
)
node "%~dp0tools\setup.mjs" %*
if errorlevel 1 pause
