@echo off
rem Removes the helpers of Arabic Text for Affinity for this Windows user.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\uninstall.ps1"
pause
