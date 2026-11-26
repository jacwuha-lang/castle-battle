@echo off
cd /d "%~dp0"

set "PY=python"
%PY% -c "import sys" >nul 2>nul
if errorlevel 1 set "PY=py"
%PY% -c "import sys" >nul 2>nul
if errorlevel 1 (
  echo Python 3 not found. Install it from https://www.python.org/downloads/
  pause
  exit /b 1
)

echo Starting Castle Battle...
%PY% server.py
if errorlevel 1 pause
