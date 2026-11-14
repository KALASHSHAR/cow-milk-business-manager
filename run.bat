@echo off
title GauDhan - Cow Milk Business Manager
echo Starting GauDhan Cow Milk Business & Dairy Manager...
cd /d "%~dp0"
start http://localhost:5000
python app.py
pause
