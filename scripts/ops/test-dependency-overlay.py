import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("overlay", Path(__file__).with_name("prepare-dependency-overlay.py"))
overlay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(overlay)


def package_bytes(path="package/package.json"):
    data = json.dumps({"name": "new", "version": "1.0.0"}).encode()
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as archive:
        info = tarfile.TarInfo(path)
        info.size = len(data)
        archive.addfile(info, io.BytesIO(data))
    return output.getvalue()


class OverlayTests(unittest.TestCase):
    @unittest.skipIf(os.name == "nt", "Linux deployment symlinks require Windows developer privileges; exercised in CI")
    def test_additions_preserve_old_files_and_nested_packages(self):
        data = package_bytes()
        meta = {"version": "1.0.0", "resolved": "https://registry.npmjs.org/new/-/new-1.0.0.tgz", "integrity": "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base, candidate = root / "base", root / "candidate"
            (base / "node_modules/old").mkdir(parents=True)
            (base / "node_modules/old/evidence.txt").write_text("unchanged")
            candidate.mkdir()
            old = {"packages": {"": {"dependencies": {"old": "1"}}, "node_modules/old": {"version": "1"}}}
            new = json.loads(json.dumps(old))
            new["packages"].update({"node_modules/new": meta, "node_modules/new/node_modules/nested": meta})
            (base / "package-lock.json").write_text(json.dumps(old))
            (candidate / "package-lock.json").write_text(json.dumps(new))
            result = overlay.prepare(base, candidate, lambda _: data)
            self.assertEqual(len(result["added"]), 2)
            self.assertTrue((candidate / "node_modules/old").is_symlink())
            self.assertEqual((base / "node_modules/old/evidence.txt").read_text(), "unchanged")
            self.assertFalse((base / "node_modules/new").exists())
            self.assertTrue((candidate / "node_modules/new/node_modules/nested/package.json").is_file())
            with self.assertRaises(AssertionError):
                overlay.prepare(base, candidate, lambda _: data)
            new["packages"]["node_modules/old"]["version"] = "2"
            with self.assertRaises(AssertionError):
                overlay.additions(old, new)

    def test_integrity_and_archive_traversal_fail_before_extract(self):
        with tempfile.TemporaryDirectory() as directory:
            dest = Path(directory) / "package"
            data = package_bytes()
            with self.assertRaises(AssertionError):
                overlay.extract(data, "sha512-incorrect", dest)
            data = package_bytes("package/../../outside")
            integrity = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
            with self.assertRaises(AssertionError):
                overlay.extract(data, integrity, dest)
            self.assertFalse(dest.exists())


if __name__ == "__main__":
    unittest.main()
