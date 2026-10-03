@echo off
rem Installs the helpers of Arabic Text for Affinity for this Windows user (no admin rights needed).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install.ps1"
pause
