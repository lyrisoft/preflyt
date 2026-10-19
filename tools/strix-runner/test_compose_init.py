import os
from pathlib import Path
import tempfile
import unittest
from compose_init import initialize

class ComposeInitializationTests(unittest.TestCase):
    def test_copies_only_engine_client_identity_with_restrictive_ownership(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);source=root/'engine';source.mkdir()
            for name in ['ca.pem','cert.pem','key.pem']:(source/name).write_text('-----BEGIN CERTIFICATE-----\nfixture\n')
            (source/'server-key.pem').write_text('DO_NOT_COPY')
            target=root/'client';state=root/'state'
            initialize([state],source,target,os.getuid(),os.getgid())
            self.assertEqual(sorted(p.name for p in target.iterdir()),['ca.pem','cert.pem','key.pem'])
            self.assertEqual(state.stat().st_mode&0o777,0o700)
            for path in target.iterdir():self.assertEqual(path.stat().st_mode&0o777,0o400)
    def test_rejects_storage_symlinks(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);(root/'actual').mkdir();(root/'link').symlink_to(root/'actual',target_is_directory=True)
            with self.assertRaises(ValueError):initialize([root/'link'],root/'engine',root/'client',os.getuid(),os.getgid())
    def test_rejects_symlink_certificate(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);source=root/'engine';source.mkdir();(root/'private').write_text('private')
            (source/'ca.pem').symlink_to(root/'private')
            with self.assertRaises(OSError):initialize([],source,root/'client',os.getuid(),os.getgid())

if __name__=='__main__':unittest.main()
