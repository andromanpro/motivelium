"""Keep the compiler-generated uninstaller for static PE verification; never run it."""
from pathlib import Path
import sys,hashlib,json
source=Path(sys.argv[1]);target=Path(sys.argv[2])
assert source.is_file() and not target.exists() and target.parent.is_dir()
content=source.read_bytes();assert content.startswith(b'MZ') and len(content)>1024
target.write_bytes(content)
print(json.dumps({'capturedUninstaller':str(target),'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()}))
