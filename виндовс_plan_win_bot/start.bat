@echo off
setlocal
cd /d %~dp0

docker compose build --no-cache
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

docker compose up -d --force-recreate
if errorlevel 1 (
  echo Start failed.
  pause
  exit /b 1
)

echo Done.
pause
