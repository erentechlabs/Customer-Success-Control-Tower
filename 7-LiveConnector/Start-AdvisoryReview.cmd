@echo off
rem Advisory review - optional standalone preview on http://127.0.0.1:8788/ (not required for normal
rem use; the "Advisory review" tab inside Control Tower itself is the primary way to use this feature).
setlocal
cd /d "%~dp0"
set "MODE="
if "%~1"=="--demo" set "MODE=--demo"
if not "%~1"=="" if not "%~1"=="--demo" (
  echo Usage: Start-AdvisoryReview.cmd [--demo]
  exit /b 1
)
where pythonw >nul 2>nul && (start "" pythonw "%~dp0advisory_review.py" %MODE% --open & exit /b 0)
where pyw >nul 2>nul && (start "" pyw -3 "%~dp0advisory_review.py" %MODE% --open & exit /b 0)
where python >nul 2>nul && (start "Advisory review" /min python "%~dp0advisory_review.py" %MODE% --open & exit /b 0)
echo Python 3.10 or later is required.
exit /b 1
