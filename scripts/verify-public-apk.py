"""Validate the actual APK and stage only public release assets. No signing keys."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile

repo = Path.cwd()
apk = repo / "apps/android/app/build/outputs/apk/debug/app-debug.apk"
dist = repo / "dist"
sha = os.environ["GITHUB_SHA"]
version = os.environ["VERSION_NAME"]
code = int(os.environ["VERSION_CODE"])
config = json.loads((repo / "apps/web/src/bundled-audio.json").read_text())
assert not any(config.get(k) for k in ["available", "src", "bytes", "audio", "lyrics", "score", "package"]), "Private bundled inputs in public build"
assert re.fullmatch(r"[0-9a-f]{40}", sha)
with zipfile.ZipFile(apk) as z:
    assert not any("private-media/" in n or n.endswith((".keystore", ".jks", ".pk8")) for n in z.namelist()), "Private asset/key in APK"
    actual = json.loads(z.read("assets/public/version.json"))
    assert actual["sha"] == sha[:12] and actual["appVersion"] == version, actual
    assert z.read("classes.dex").startswith(b"dex\n")
    for p in dist.rglob("*"):
        if p.is_file():
            assert z.read("assets/public/" + p.relative_to(dist).as_posix()) == p.read_bytes(), p
    for name in ["demo.wav", "demo.lrc", "piano-demo.musicxml"]:
        assert len(z.read("assets/public/demo/" + name)) > 0
sdk = Path(os.environ.get("ANDROID_HOME") or os.environ["ANDROID_SDK_ROOT"])
tools = sdk / "build-tools/36.0.0"
badging = subprocess.check_output([str(tools / "aapt"), "dump", "badging", str(apk)], text=True)
assert f"versionCode='{code}'" in badging and f"versionName='{version}'" in badging
assert "name='io.github.cosmoszhan.anisong'" in badging
verified = subprocess.check_output([str(tools / "apksigner"), "verify", "--verbose", "--print-certs", str(apk)], text=True)
assert "Verified using v2 scheme (APK Signature Scheme v2): true" in verified
cert = next(line.split(": ", 1)[1].lower() for line in verified.splitlines() if "certificate SHA-256 digest" in line)
assert re.fullmatch(r"[0-9a-f]{64}", cert)
policy = json.loads((repo / ".github/android-preview.json").read_text())
if os.environ.get("PREVIEW_SIGNING") == "repository-secret":
    assert cert == policy["signerSha256"], f"Fixed APK certificate mismatch: actual={cert}, expected={policy['signerSha256']}"

reports = list((repo / "apps/android/app/build/test-results/testDebugUnitTest").glob("TEST-*.xml"))
tests = 0
for report in reports:
    suite = ET.parse(report).getroot()
    tests += int(suite.attrib["tests"])
    assert all(int(suite.attrib.get(k, 0)) == 0 for k in ["failures", "errors", "skipped"])
assert tests >= 5, "Missing native test evidence"
out = repo / "preview-dist"
out.mkdir(exist_ok=True)
name = f"anisong-{version}-debug.apk"
target = out / name
shutil.copy2(apk, target)
digest = hashlib.sha256(target.read_bytes()).hexdigest()
info = {"version": version, "tag": "v" + version, "versionCode": code, "apkName": name,
        "sha": sha, "repository": os.environ["GITHUB_REPOSITORY"], "runId": os.environ["GITHUB_RUN_ID"],
        "signing": os.environ.get("PREVIEW_SIGNING", "ephemeral-debug"), "signerSha256": cert,
        "apkSha256": digest, "nativeTests": tests, "publicMediaOnly": True,
        "mediaConfig": config, "frontendVersion": actual}
(out / "build-info.json").write_text(json.dumps(info, indent=2) + "\n")
(out / "SHA256SUMS.txt").write_text("".join(
    hashlib.sha256(p.read_bytes()).hexdigest() + "  " + p.name + "\n"
    for p in [target, out / "build-info.json"]))
print(json.dumps({"apk": name, "sha": sha, "signatureV2": True, "signing": info["signing"], "signerSha256": cert, "nativeTests": tests, "publicMediaOnly": True}))
