import os
import tempfile
from pathlib import Path

# Keep tests off the real demo database. Must run before app.db is imported.
os.environ.setdefault("BACKPOCKET_DB", str(Path(tempfile.gettempdir()) / "backpocket-test.db"))
