#!/usr/bin/env python3
"""Add lock-pinned packages without modifying an existing release's dependencies.

Only additive lock changes are accepted. A fresh candidate gets symlinks to the
base packages and private copies of the additions. No lifecycle scripts run.
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile
import urllib.request
from urllib.parse import urlsplit


def additions(old, new):
    before, after = old["packages"], new["packages"]
    for key, value in before.items():
        if key:
            assert after.get(key) == value, "Existing dependency changed: " + key
    for group in ("dependencies", "devDependencies", "optionalDependencies"):
        for name, version in before[""].get(group, {}).items():
            assert after[""].get(group, {}).get(name) == version, "Root dependency changed"
    result = {k: v for k, v in after.items() if k not in before}
    assert result, "No added dependencies"
    for key, metadata in result.items():
        parts = PurePosixPath(key).parts
        assert parts[0] == "node_modules" and ".." not in parts and "\\" not in key
        assert not PurePosixPath(key).is_absolute()
        assert not metadata.get("hasInstallScript") and not metadata.get("link")
        parent = key.rsplit("/node_modules/", 1)
        if len(parent) == 2:
            assert parent[0] in result, "Cannot write into a shared dependency"
        url = urlsplit(metadata["resolved"])
        assert url.scheme == "https" and url.hostname == "registry.npmjs.org"
        assert not url.username and not url.password and url.port in (None, 443)
        assert metadata["integrity"].startswith("sha512-")
    return result


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        assert urlsplit(response.geturl()).hostname == "registry.npmjs.org"
        return response.read(32 * 1024 * 1024 + 1)


def extract(data, integrity, destination):
    assert len(data) <= 32 * 1024 * 1024, "Package download too large"
    assert base64.b64encode(hashlib.sha512(data).digest()).decode() == integrity[7:], "Package integrity mismatch"
    destination = destination.resolve()
    assert not destination.exists(), "Package already exists"
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        members = archive.getmembers()
        assert sum(m.size for m in members) <= 64 * 1024 * 1024
        for m in members:
            parts = PurePosixPath(m.name).parts
            assert parts and parts[0] == "package" and ".." not in parts and "\\" not in m.name
            assert m.isdir() or m.isfile(), "Package links and special files are forbidden"
        destination.mkdir(parents=True)
        for m in members:
            parts = PurePosixPath(m.name).parts[1:]
            if not parts:
                continue
            out = destination.joinpath(*parts)
            assert destination in out.resolve().parents
            if m.isdir():
                out.mkdir(parents=True, exist_ok=True)
            else:
                out.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(m) as source, out.open("xb") as target:
                    target.write(source.read())
                out.chmod(0o755 if m.mode & 0o111 else 0o644)


def prepare(base, candidate, downloader=fetch):
    base, candidate = base.resolve(), candidate.resolve()
    assert base != candidate and base not in candidate.parents and candidate not in base.parents
    old = json.loads((base / "package-lock.json").read_text())
    new = json.loads((candidate / "package-lock.json").read_text())
    added = additions(old, new)
    source, target = base / "node_modules", candidate / "node_modules"
    assert source.is_dir() and not target.exists() and not target.is_symlink()
    target.mkdir()
    for package in source.iterdir():
        if package.name == ".package-lock.json":
            continue
        if package.name.startswith("@"):
            scope = target / package.name
            scope.mkdir()
            for child in package.iterdir():
                (scope / child.name).symlink_to(child.resolve(), target_is_directory=child.is_dir())
        else:
            (target / package.name).symlink_to(package.resolve(), target_is_directory=package.is_dir())
    for key in sorted(added, key=lambda p: (p.count("/"), p)):
        meta = added[key]
        destination = candidate / key
        assert candidate in destination.resolve().parents, "Addition would modify base"
        extract(downloader(meta["resolved"]), meta["integrity"], destination)
        installed = json.loads((destination / "package.json").read_text())
        assert installed["version"] == meta["version"]
    manifest = {"base": str(base), "lockSha256": hashlib.sha256((candidate / "package-lock.json").read_bytes()).hexdigest(), "added": sorted(added)}
    (target / ".saas-overlay.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-release", required=True, type=Path)
    parser.add_argument("--candidate", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.base_release, args.candidate), indent=2))
