@echo off
rem Copies the installed Arabic fonts to the Desktop folder the Affinity tool reads from.
rem The background helper does this by itself; use this after installing a font if you are in a hurry.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\sync-fonts.ps1"
if "%1"=="" pause
