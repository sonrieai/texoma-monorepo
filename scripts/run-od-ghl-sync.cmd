@echo off
cd /d D:\texoma-monorepo-main\texoma-monorepo-main
set MODE=%~1
if "%MODE%"=="" set MODE=consults
call npm run sync:od-ghl -- --mode=%MODE% >> data\od-ghl-sync.log 2>&1
