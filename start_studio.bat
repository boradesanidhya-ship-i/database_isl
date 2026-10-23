@echo off
title SignLine Video Studio & Cloud Database
color 0B
cls

echo =======================================================================
echo          SIGNLINE VIDEO STUDIO ^& SUPABASE DATABASE RECORDER           
echo =======================================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your PATH!
    echo Please install Node.js from https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
)

:: Check dependencies
if not exist "node_modules\" (
    echo [INFO] Installing required dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo [INFO] Starting SignLine Web Server on http://localhost:3000 ...
echo [INFO] Target Supabase Tables: signline_skeleton_recordings (Zero-Video Storage)
echo [INFO] Real-Time MediaPipe Skeleton Tracking & Replay Active!
echo.

:: Launch browser in background after 2 seconds
start "" powershell -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"

:: Run server
call node server.js

pause
