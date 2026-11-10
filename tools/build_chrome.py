"""Build the Chrome / Edge package: dist/jms-dark-<version>-chrome.zip.

The source tree is the Firefox add-on. Chrome needs a service-worker background
and doesn't know Firefox's browser_specific_settings, so this writes a Chrome
manifest and zips it with the extension files.  Usage: python tools/build_chrome.py
"""
import json, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ["src", "themes", "icons"]

manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
manifest.pop("browser_specific_settings", None)
manifest["background"] = {"service_worker": manifest["background"]["scripts"][0]}
manifest["minimum_chrome_version"] = "121"

out = ROOT / "dist" / f"jms-dark-{manifest['version']}-chrome.zip"
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("manifest.json", json.dumps(manifest, indent=2) + "\n")
    for top in FILES:
        for f in sorted((ROOT / top).rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(ROOT).as_posix())
print(out)
