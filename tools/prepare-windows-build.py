"""Fetch the pinned NSIS compiler for a source checkout. No install or elevation."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import shutil
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NSIS_SHA = 'ba63dffc4410ee89193e1cb5a41989991bd77c61068da17e3156d136b7b0b3d8'
URL = 'https://downloads.sourceforge.net/project/nsis/NSIS%203/3.13/nsis-3.13.zip'

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', default=str(ROOT/'.build-cache/windows'))
    args = parser.parse_args()
    cache = Path(args.cache).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache/'nsis-3.13.zip'
    if not archive.exists():
        legacy = ROOT/'lab/release-r6-20261020/downloads/nsis-3.13.zip'
        partial = cache/'nsis-3.13.zip.part'
        if legacy.is_file() and digest(legacy) == NSIS_SHA:
            shutil.copyfile(legacy, partial)
        else:
            request = urllib.request.Request(URL, headers={'User-Agent':'Motivelium-build/0.1'})
            with urllib.request.urlopen(request, timeout=90) as response:
                partial.write_bytes(response.read())
        if digest(partial) != NSIS_SHA:
            raise RuntimeError('NSIS archive differs from the pinned SHA-256; not extracted')
        partial.replace(archive)
    if digest(archive) != NSIS_SHA:
        raise RuntimeError('Cached NSIS archive differs from the pinned SHA-256')
    with zipfile.ZipFile(archive) as source:
        assert source.testzip() is None, 'NSIS ZIP CRC mismatch'
        for entry in source.infolist():
            name = PurePosixPath(entry.filename.replace('\\','/'))
            target = (cache/str(name)).resolve()
            assert not name.is_absolute() and target.is_relative_to(cache) and '..' not in name.parts and ':' not in str(name), 'Unsafe NSIS archive entry'
            assert (entry.external_attr >> 16) & 0o170000 != 0o120000, 'NSIS archive contains symlink'
        # Re-extract verified bytes so an edited cached compiler cannot silently be used.
        source.extractall(cache)
    compiler = cache/'nsis-3.13/makensis.exe'
    assert compiler.is_file()
    print(json.dumps({'compiler':str(compiler),'archive':str(archive),'archiveSHA256':NSIS_SHA,'installed':False}))

if __name__ == '__main__':
    main()
