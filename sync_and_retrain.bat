@echo off
title SignLine - Sync Database Videos & Retrain Pipeline
color 0A
cls

echo =======================================================================
echo         SIGNLINE AI - PIPELINE SYNC ^& MODEL RETRAINING ENGINE        
echo =======================================================================
echo.

:: 1. Sync videos from Supabase Database and Storage Bucket
echo [STEP 1/2] Connecting to Supabase and syncing recorded videos...
call node pipeline/sync_dataset.js

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Dataset sync failed. Check your Supabase connection in .env.
    pause
    exit /b 1
)

echo.
echo [STEP 2/2] Running Gesture Model Retraining Pipeline...
echo.

:: 2. Check for Python
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [INFO] Python found. Executing pipeline/retrain_model.py ...
    python pipeline/retrain_model.py
) else (
    echo [INFO] Python not found in PATH.
    echo [INFO] Videos have been downloaded and organized into dataset/raw_videos/
    echo [INFO] Manifest created at dataset/dataset_manifest.json
    echo.
    echo To run Python ML models (MediaPipe/PyTorch), install Python and run:
    echo   pip install -r pipeline/requirements.txt
    echo   python pipeline/retrain_model.py
)

echo.
echo =======================================================================
echo [SUCCESS] Database videos are synced and pipeline is up to date!
echo =======================================================================
echo.
pause
