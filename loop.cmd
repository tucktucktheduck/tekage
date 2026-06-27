@echo off
REM Convenience wrapper so you can run the loop without touching PowerShell's
REM execution policy:  loop.cmd -Iters 3
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0loop.ps1" %*
