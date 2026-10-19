"""Bounded bulk upload of the controller's already verified source copy."""
import io
from pathlib import Path
import tarfile

from agents.sandbox.entries import LocalDir


def source_archive(manifest):
    if manifest.root != "/workspace" or len(manifest.entries) != 1:
        raise ValueError("Unexpected source manifest")
    name, entry = next(iter(manifest.entries.items()))
    if str(name) != "source" or not isinstance(entry, LocalDir) or not entry.src:
        raise ValueError("Only the source copy may be uploaded")
    root = entry.src.resolve()
    if not root.is_relative_to(Path.cwd().resolve()):
        raise ValueError("Source copy must be inside the job directory")
    buffer = io.BytesIO()
    total = count = 0
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        for path in sorted(root.rglob("*")):
            if path.is_symlink():
                raise ValueError("Source links are not allowed")
            if not path.is_file():
                continue
            relative = path.relative_to(root)
            if any(part in ["", ".", ".."] or part.lower() == ".git" for part in relative.parts):
                raise ValueError("Unsafe source path")
            if "\\" in str(relative) or any(ord(c) < 32 for c in str(relative)):
                raise ValueError("Unsafe source path")
            data = path.read_bytes()
            count += 1
            total += len(data)
            if count > 8000 or len(data) > 2 * 1024**2 or total > 64 * 1024**2:
                raise ValueError("Source limit exceeded")
            info = tarfile.TarInfo("source/" + relative.as_posix())
            info.size = len(data)
            info.mode = 0o700 if path.stat().st_mode & 0o100 else 0o600
            archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue()
