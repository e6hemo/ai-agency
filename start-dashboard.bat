@echo off
title OpenClaude AI Agency
echo.
echo  ================================================
echo   ⚡  OpenClaude AI Agency — تشغيل لوحة التحكم
echo  ================================================
echo.

cd /d "%~dp0"

:: Check if dist/cli.mjs exists
if not exist "dist\cli.mjs" (
  echo  ⚠️  الملف dist\cli.mjs غير موجود. جاري البناء...
  call npm run build
)

echo  🚀 جاري تشغيل خادم لوحة التحكم...
echo  📊 سيُفتح المتصفح تلقائياً على الداشبورد
echo.
echo  ℹ️  للإيقاف: اضغط Ctrl+C
echo.

node dist\cli.mjs agency serve
