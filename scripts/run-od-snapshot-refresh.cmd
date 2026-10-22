@echo off
cd /d D:\texoma-monorepo-main\texoma-monorepo-main
call npm run snapshot:refresh >> data\od-snapshot-refresh.log 2>&1
