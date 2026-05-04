#!/usr/bin/env python
import sys
sys.path.insert(0, 'd:\\ai-study-mate\\backend')

# Test database connection
from app.db import engine, SQLModel
from sqlmodel import Session, text

print("Testing database connection...")
try:
    with Session(engine) as session:
        session.exec(text("SELECT 1"))
    print("✓ Database connected successfully")
except Exception as e:
    print(f"✗ Database connection failed: {e}")
    sys.exit(1)

# Test app initialization
print("\nTesting app initialization...")
try:
    from app.main import app
    print("✓ App initialized successfully")
except Exception as e:
    print(f"✗ App initialization failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n✓ All basic tests passed!")
