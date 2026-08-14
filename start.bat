@echo off
REM VehicleVault launcher - serves the app over HTTP and opens it in your browser.
REM ES modules and the service worker require HTTP, so double-clicking index.html
REM directly does NOT work. Use this launcher instead.

setlocal
cd /d "%~dp0"

set "PORT=8080"
set "URL=http://127.0.0.1:%PORT%/index.html"

REM Find a Python launcher (py first, then python).
where py >nul 2>nul && (set "PY=py") || (where python >nul 2>nul && set "PY=python")

if not defined PY (
  echo Python was not found on this system.
  echo Install Python 3 from https://www.python.org/downloads/ and re-run this file.
  pause
  exit /b 1
)

echo Starting VehicleVault on %URL%
echo Leave this window open while using the app. Press Ctrl+C to stop the server.
start "" "%URL%"
%PY% -m http.server %PORT% --bind 127.0.0.1

endlocal
