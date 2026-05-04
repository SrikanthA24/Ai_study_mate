#!/usr/bin/env python3
import os
import sys

# Change to backend directory
os.chdir(r'd:\ai-study-mate\backend')
sys.path.insert(0, r'd:\ai-study-mate\backend')

# Now start uvicorn
import uvicorn
from app.main import app

if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=8000, log_level='debug')
