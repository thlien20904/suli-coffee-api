@echo off
echo.
echo 🚀 Starting CSP Demo Server with Real-time Monitoring...
echo.

REM Regenerate CSP hash
echo 📝 Regenerating CSP hash...
node scripts\build-hast.js

echo.
echo ✅ Server starting at http://localhost:5000
echo.
echo 📊 Real-time Dashboard: http://localhost:5000/report-log-realtime
echo 📈 Real-time Analytics: http://localhost:5000/analyze-realtime
echo 🏠 Home Page: http://localhost:5000/csp
echo.
echo Press Ctrl+C to stop
echo.

REM Start server
npm start
