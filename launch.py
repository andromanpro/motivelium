"""Compatibility wrapper. START.cmd uses Node directly; Python is optional."""
from pathlib import Path
import shutil
import subprocess
import sys
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js 24.12+ (24.x) is required. Use SETUP.cmd first.')
raise SystemExit(subprocess.call([node, str(Path(__file__).resolve().with_suffix('.mjs')), *sys.argv[1:]]))
