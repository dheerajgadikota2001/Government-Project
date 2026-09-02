@echo off
REM ============================================================
REM  AP Nadu Nedu - daily live tracking run
REM  Runs every scraper, then refreshes the source-status tracker.
REM  Output is appended to backend\logs\scrape_YYYY-MM-DD.log
REM  Registered via Task Scheduler (see DATA-SOURCES.md / ROADMAP.md)
REM ============================================================

cd /d "C:\Users\gadik\Documents\Claude\Projects\Politics Platform\politics-platform\backend"

if not exist logs mkdir logs

REM locale-safe date stamp via python
for /f %%i in ('python -c "import datetime;print(datetime.date.today())"') do set STAMP=%%i

echo ================================================== >> "logs\scrape_%STAMP%.log"
echo Run started %date% %time% >> "logs\scrape_%STAMP%.log"

python scripts\run_all_scrapers.py >> "logs\scrape_%STAMP%.log" 2>&1
python scripts\check_sources.py --network >> "logs\scrape_%STAMP%.log" 2>&1

echo Run finished %date% %time% >> "logs\scrape_%STAMP%.log"
