"""Generates golden .mpy files with pybricksdev's compiler (PyPI mpy-cross-v6).

Run through scripts/golden/generate-mpy-cross-v6.sh, which installs the pinned compiler in a
throwaway Python container. For every *.py in the golden directory it writes:

- <name>.mpy  the compiled module, when compilation succeeds
- <name>.err  mpy-cross's stderr, when it fails

and manifest.json with the compiler version and a SHA-256 per output. The browser build
(@pybricks/mpy-cross-v6) must reproduce these bytes exactly: src/lib/pybricks/compiler.golden.test.ts.
"""

import hashlib
import json
import pathlib
import sys
from importlib.metadata import version

import mpy_cross_v6

golden_dir = pathlib.Path(sys.argv[1])
manifest = {"compiler": "mpy-cross-v6", "version": version("mpy-cross-v6"), "outputs": {}}

for source in sorted(golden_dir.glob("*.py")):
    for stale in (source.with_suffix(".mpy"), source.with_suffix(".err")):
        stale.unlink(missing_ok=True)
    # The file name is embedded in the .mpy, so both compilers get the same bare name.
    proc, mpy = mpy_cross_v6.mpy_cross_compile(source.name, source.read_text(encoding="utf-8"))
    if proc.returncode == 0 and mpy is not None:
        out = source.with_suffix(".mpy")
        out.write_bytes(mpy)
    else:
        out = source.with_suffix(".err")
        out.write_text(proc.stderr if isinstance(proc.stderr, str) else proc.stderr.decode())
    manifest["outputs"][out.name] = hashlib.sha256(out.read_bytes()).hexdigest()

# The upload format: pybricksdev's own packer, on the simplest program.
try:
    import asyncio

    from pybricksdev.compile import compile_multi_file

    packed = asyncio.run(compile_multi_file(str(golden_dir / "hello.py"), 6))
    (golden_dir / "hello.multi-mpy.bin").write_bytes(packed)
    manifest["pybricksdev"] = version("pybricksdev")
    manifest["outputs"]["hello.multi-mpy.bin"] = hashlib.sha256(packed).hexdigest()
except ImportError:
    print("pybricksdev not installed: hello.multi-mpy.bin not regenerated", file=sys.stderr)

(golden_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
print(json.dumps(manifest, indent=2, sort_keys=True))
