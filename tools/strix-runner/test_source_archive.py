import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest

try:
    from agents.sandbox.entries import LocalDir
    from agents.sandbox.manifest import Manifest
    from source_archive import source_archive
    HAS_SDK = True
except ImportError:
    HAS_SDK = False


@unittest.skipUnless(HAS_SDK, "Run with the pinned Strix Python environment")
class SourceArchiveTests(unittest.TestCase):
    def setUp(self):
        self.previous = Path.cwd()
        self.temp = tempfile.TemporaryDirectory()
        os.chdir(self.temp.name)
        self.source = Path("source")
        self.source.mkdir()

    def tearDown(self):
        os.chdir(self.previous)
        self.temp.cleanup()

    def manifest(self):
        return Manifest(entries={"source": LocalDir(src=self.source)})

    def test_bulk_copy_preserves_content_and_relative_paths(self):
        (self.source / "space name.py").write_text("print('fixture')")
        archive = source_archive(self.manifest())
        with tarfile.open(fileobj=io.BytesIO(archive)) as saved:
            self.assertEqual(saved.getnames(), ["source/space name.py"])
            self.assertEqual(saved.extractfile(saved.getmembers()[0]).read(), b"print('fixture')")

    def test_host_links_are_rejected(self):
        (self.source / "host").symlink_to(self.previous)
        with self.assertRaises(ValueError):
            source_archive(self.manifest())

    def test_outside_job_and_oversized_inputs_are_rejected(self):
        with self.assertRaises(ValueError):
            source_archive(Manifest(entries={"source": LocalDir(src=self.previous)}))
        (self.source / "oversized").write_bytes(b"x" * (2 * 1024**2 + 1))
        with self.assertRaises(ValueError):
            source_archive(self.manifest())


if __name__ == "__main__":
    unittest.main()
