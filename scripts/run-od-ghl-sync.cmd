@echo off
cd /d D:\texoma-monorepo-main\texoma-monorepo-main
call npm run sync:od-ghl >> data\od-ghl-sync.log 2>&1
