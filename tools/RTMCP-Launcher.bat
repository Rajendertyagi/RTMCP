@echo off
:: RTMCP Server Manager — double-click this, pick an action.
:: Keep this file in the SAME folder as indian-option-mcp.exe.
:: You never need Task Manager again.
setlocal
set "EXE=%~dp0indian-option-mcp.exe"
if not exist "%EXE%" (
  echo ERROR: Could not find indian-option-mcp.exe next to this launcher.
  echo Place this .bat in the same folder as the .exe, then try again.
  pause
  exit /b 1
)

:menu
cls
echo ============================================
echo          RTMCP Server Manager
echo ============================================
echo   1. Start server (dashboard)
echo   2. Restart server (kill old + start new)
echo   3. Stop / Kill server
echo   4. Status (is it running?)
echo   5. Exit
echo ============================================
set /p CHOICE=Choose [1-5]:

if "%CHOICE%"=="1" start "" "%EXE%" start
if "%CHOICE%"=="2" start "" "%EXE%" restart
if "%CHOICE%"=="3" "%EXE%" stop
if "%CHOICE%"=="4" "%EXE%" status
if "%CHOICE%"=="5" exit /b 0
echo Invalid choice.
pause
goto menu
