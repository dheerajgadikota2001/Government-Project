@echo off
REM ============================================================
REM  AP Fact Check : tenders refresh, run from this laptop.
REM
REM  STATUS: FALLBACK. Since 6 Sep 2026 the daily tenders refresh runs
REM  on GitHub Actions (.github/workflows/tenders-refresh.yml), which
REM  reaches crda.ap.gov.in where Google Cloud cannot. Keep this file
REM  for the day GitHub is down or blocked; docs/TENDERS-ON-GITHUB.md.
REM
REM  WHY THIS EXISTS
REM  crda.ap.gov.in drops connections from Google's network. Proven
REM  6 Sep 2026 with a browser User-Agent from Cloud Run: ReadTimeout
REM  every time, while the same page loads in a second from a home
REM  connection. So this one group runs here. Everything else stays
REM  on the Cloud Run job.
REM
REM  WHY PORT 5435 AND A SEPARATE ENV FILE
REM  This laptop also runs a local Postgres on 5434 for development,
REM  with a database of the same name. The first version of this file
REM  started the proxy on 5434, the proxy failed to bind, and the run
REM  wrote to the local database while looking exactly like success.
REM  So: the proxy gets a port nothing else uses, the run reads
REM  .env.cloud instead of .env, and the script refuses to continue if
REM  anything is already listening on the proxy port.
REM
REM  WHAT IT DOES
REM  1. refuses if 5435 is already taken
REM  2. starts the Cloud SQL proxy on 5435
REM  3. waits until it answers
REM  4. runs only the tenders group against .env.cloud, recorded as a
REM     scheduled run so /updates shows it like the cloud job
REM  5. stops the proxy
REM  Output: backend\logs\tenders_YYYY-MM-DD.log. The first lines of the
REM  run print which database it connected to. Read them.
REM ============================================================

cd /d "C:\Users\gadik\Documents\Claude\Projects\Politics Platform\politics-platform\backend"
if not exist logs mkdir logs

for /f %%i in ('python -c "import datetime;print(datetime.date.today())"') do set STAMP=%%i
set LOG=logs\tenders_%STAMP%.log
set PROXY_PORT=5435
set APNN_ENV_FILE=.env.cloud

echo ================================================== >> "%LOG%"
echo Run started %date% %time% >> "%LOG%"

if not exist "%APNN_ENV_FILE%" (
  echo %APNN_ENV_FILE% is missing. Nothing run. >> "%LOG%"
  exit /b 1
)

REM --- 1. nothing may already own the proxy port
python scripts\wait_port.py %PROXY_PORT% --must-be-free >> "%LOG%" 2>&1
if errorlevel 1 (
  echo Refusing to start: port %PROXY_PORT% is taken. Nothing scraped. >> "%LOG%"
  exit /b 1
)

REM --- 2. proxy, minimised, with a window title we can find again
start "apnn-sql-proxy" /min cloud-sql-proxy.exe --port %PROXY_PORT% ap-nadu-nedu:asia-south1:apnn-db

REM --- 3. wait up to 40 s for it to listen
python scripts\wait_port.py %PROXY_PORT% 40 >> "%LOG%" 2>&1
if errorlevel 1 (
  echo Proxy did not start. Nothing scraped. >> "%LOG%"
  taskkill /FI "WINDOWTITLE eq apnn-sql-proxy*" /F >nul 2>&1
  exit /b 1
)

REM --- 4. the run. Alerts go out if RESEND_API_KEY and ALERT_TO are in .env.cloud.
python scripts\run_all_scrapers.py --only tenders --trigger scheduled >> "%LOG%" 2>&1
set RC=%ERRORLEVEL%

REM --- 5. always stop the proxy, even after a failure
taskkill /FI "WINDOWTITLE eq apnn-sql-proxy*" /F >nul 2>&1

echo Run finished %date% %time% (exit %RC%) >> "%LOG%"
exit /b %RC%
