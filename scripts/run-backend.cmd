@echo off
rem Start the SwipeRight backend locally on Windows.
rem
rem Run this from your own terminal, never from a Claude session: the Claude desktop
rem app redirects AppData writes for everything it launches, which breaks the Unix
rem socket Encore's daemon needs ("The file cannot be accessed by the system").
rem
rem First time only: encore auth login
rem   The app is linked to Encore Cloud, and encore run fetches its development secrets
rem   from there. Local overrides (gitignored) go in backend\.secrets.local.cue.
rem
rem Extra arguments pass through, e.g. scripts\run-backend.cmd --namespace smoke
setlocal
set "ROOT=%~dp0.."

rem Encore's native runtime is x64, so on an ARM64 PC it needs an x64 Node first on PATH.
if exist "%ROOT%\.tools\node-x64\node-v22.16.0-win-x64\node.exe" set "PATH=%ROOT%\.tools\node-x64\node-v22.16.0-win-x64;%PATH%"

rem Restart the daemon so the app process it spawns inherits the PATH above.
encore daemon

cd /d "%ROOT%\backend"
encore run %*
