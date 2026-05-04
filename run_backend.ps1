#!/usr/bin/env powershell
cd d:\ai-study-mate\backend
$env:PYTHONPATH="d:\ai-study-mate\backend"
& d:\ai-study-mate\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
