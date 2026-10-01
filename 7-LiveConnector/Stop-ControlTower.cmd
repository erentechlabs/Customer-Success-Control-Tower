@echo off
rem Customer Success Control Tower - stops the live Outlook connector.
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/shutdown' -Headers @{ 'X-CSCT' = 'stop' } | Out-Null; 'Control Tower connector stopped.' } catch { 'The connector is not running.' }; Start-Sleep -Seconds 2"
