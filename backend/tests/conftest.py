"""
conftest.py for backend/tests/

Ensures the backend root directory is on sys.path so that
`from app.xxx import yyy` works when running tests via pytest, and provides
the minimum environment (`DATABASE_URL`, `SECRET_KEY`) that `app.core.config`
requires at import time. No database is contacted by the security tests.
"""
import sys
import os

# Add the backend root (parent of this tests/ directory) to sys.path
backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-0123456789")
