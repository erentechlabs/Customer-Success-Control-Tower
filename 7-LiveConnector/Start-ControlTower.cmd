@echo off
rem Customer Success Control Tower - starts the live Outlook connector and opens the dashboard.
rem The connector reads your Unified support case e-mails with your own Microsoft 365 sign-in (WorkIQ)
rem and serves the dashboard at http://127.0.0.1:8787/. Case data is kept in memory only.
setlocal
cd /d "%~dp0"
where pythonw >nul 2>nul && (start "" pythonw "%~dp0csct_live.py" --open & exit /b 0)
where pyw >nul 2>nul && (start "" pyw -3 "%~dp0csct_live.py" --open & exit /b 0)
where python >nul 2>nul && (start "Control Tower connector" /min python "%~dp0csct_live.py" --open & exit /b 0)
echo Python 3.10 or later is required. Install it from https://www.python.org/downloads/ and run this file again.
pause
