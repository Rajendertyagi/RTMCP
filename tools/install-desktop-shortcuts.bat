@echo off
:: Creates three desktop shortcuts for RTMCP:
::   "RTMCP Start", "RTMCP Restart", "RTMCP Stop"
:: Run this once. Keep it next to indian-option-mcp.exe.
setlocal
set "EXE=%~dp0indian-option-mcp.exe"
if not exist "%EXE%" (
  echo ERROR: Could not find indian-option-mcp.exe next to this script.
  echo Place this .bat in the same folder as the .exe, then try again.
  pause
  exit /b 1
)

powershell -NoProfile -Command ^
  "$exe='%EXE%';" ^
  "$ws=New-Object -ComObject WScript.Shell;" ^
  "$desk=[Environment]::GetFolderPath('Desktop');" ^
  "$items=@(@('RTMCP Start','start'),@('RTMCP Restart','restart'),@('RTMCP Stop','stop'));" ^
  "foreach($i in $items){" ^
  "  $s=$ws.CreateShortcut(\"$desk\$($i[0]).lnk\");" ^
  "  $s.TargetPath=$exe; $s.Arguments=$i[1]; $s.WorkingDirectory='%~dp0';" ^
  "  $s.Description=$i[0]; $s.Save();" ^
  "  Write-Host \"Created $desk\$($i[0]).lnk\"" ^
  "}"

echo.
echo Done. Three shortcuts are now on your Desktop.
echo Double-click "RTMCP Start" to launch, "RTMCP Restart" to restart, "RTMCP Stop" to kill.
pause
