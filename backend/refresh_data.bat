@echo off
REM ============================================================
REM  AP Nadu Nedu - daily data refresh
REM  Runs every working scraper against the official portals,
REM  then reloads the curated seed files. Charts read the
REM  database through the API, so they update by themselves
REM  the moment this finishes. Safe to re-run: every scraper
REM  dedupes against the database.
REM
REM  Register it to run daily at 7:00 AM with (run once, as admin):
REM    schtasks /Create /TN "APNaduNedu Data Refresh" /TR "\"C:\Users\gadik\Documents\Claude\Projects\Politics Platform\politics-platform\backend\refresh_data.bat\"" /SC DAILY /ST 07:00
REM
REM  Remove it with:
REM    schtasks /Delete /TN "APNaduNedu Data Refresh" /F
REM ============================================================

cd /d "%~dp0"

echo [%date% %time%] Refresh starting >> refresh_log.txt

REM 1. Every scraper, one after another. A failure in one never stops the rest.
python scripts\run_all_scrapers.py >> refresh_log.txt 2>&1

REM 2. Reload seed data (no-op unless the seed files changed; always safe).
python scripts\load_seed_data.py >> refresh_log.txt 2>&1

REM 3. Source health check, so SOURCES_STATUS.md always shows current reality.
python scripts\check_sources.py --network "home-machine" >> refresh_log.txt 2>&1

echo [%date% %time%] Refresh finished >> refresh_log.txt
echo. >> refresh_log.txt
