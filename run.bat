@echo off
title SignLine Studio & Retraining Pipeline
color 0F
cls

:MENU
cls
echo =======================================================================
echo          SIGNLINE VIDEO RECORDER ^& RETRAINING PIPELINE SYSTEM         
echo =======================================================================
echo.
echo   [1] Start Camera Studio ^& Web App (Opens in Browser)
echo   [2] Sync Recorded Videos from Supabase to Local Dataset
echo   [3] Full Pipeline: Sync Database Videos ^& Retrain ML Model
echo   [4] Train ML Model Directly from Skeleton Database (Zero Video Files)
echo   [5] Install / Update Dependencies
echo   [6] Exit
echo.
echo =======================================================================
set /p choice="Select an option [1-6]: "

if "%choice%"=="1" goto START_STUDIO
if "%choice%"=="2" goto SYNC_DATASET
if "%choice%"=="3" goto FULL_PIPELINE
if "%choice%"=="4" goto TRAIN_SKELETONS
if "%choice%"=="5" goto INSTALL_DEPS
if "%choice%"=="6" goto EXIT_PROMPT

echo.
echo Invalid selection. Please choose 1, 2, 3, 4, 5, or 6.
timeout /t 2 >nul
goto MENU

:START_STUDIO
cls
call start_studio.bat
goto MENU

:SYNC_DATASET
cls
echo [INFO] Syncing videos from Supabase database (signline_videos)...
call node pipeline/sync_dataset.js
echo.
pause
goto MENU

:FULL_PIPELINE
cls
call sync_and_retrain.bat
goto MENU

:TRAIN_SKELETONS
cls
echo [INFO] Training ML model directly from stored landmark sequences in PostgreSQL...
call node pipeline/train_from_skeletons.js
echo.
pause
goto MENU

:INSTALL_DEPS
cls
echo [INFO] Installing Node.js packages...
call npm install
echo.
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [INFO] Python detected. Installing Python pipeline requirements...
    pip install -r pipeline/requirements.txt
)
echo.
echo Dependencies check complete.
pause
goto MENU

:EXIT_PROMPT
cls
echo Goodbye!
timeout /t 2 >nul
exit /b 0
