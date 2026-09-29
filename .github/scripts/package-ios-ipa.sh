#!/usr/bin/env bash
set -euo pipefail

echo "PATH=$PATH"
command -v cargo
command -v rustc
command -v node
command -v npm
xcodebuild -version

apple_dir="src-tauri/gen/apple"
echo "Listing $apple_dir"
ls -la "$apple_dir"

shopt -s nullglob
workspaces=("$apple_dir"/*.xcworkspace)
projects=("$apple_dir"/*.xcodeproj)
if ((${#workspaces[@]} > 0)); then
  proj="${workspaces[0]}"
  selector=(-workspace "$proj")
elif ((${#projects[@]} > 0)); then
  proj="${projects[0]}"
  selector=(-project "$proj")
else
  echo "No Xcode project under $apple_dir"
  find "$apple_dir" -maxdepth 4 -print
  exit 1
fi
echo "Using ${selector[*]}"

xcodebuild -list "${selector[@]}"
export XCODE_JSON
XCODE_JSON="$(xcodebuild -list "${selector[@]}" -json)"
scheme="$(python3 - <<'PY'
import json, os, sys
data = json.loads(os.environ["XCODE_JSON"])
root = data.get("project") or data.get("workspace") or {}
schemes = root.get("schemes") or []
targets = root.get("targets") or []
for name in schemes:
    if "iOS" in name or "ios" in name:
        print(name)
        raise SystemExit
if schemes:
    print(schemes[0])
    raise SystemExit
if targets:
    print(targets[0])
    raise SystemExit
raise SystemExit("no scheme or target")
PY
)"
echo "Using scheme [$scheme]"

python3 - <<'PY'
from pathlib import Path
import re
root = Path("src-tauri/gen/apple")
for pbx in root.rglob("project.pbxproj"):
    text = pbx.read_text(encoding="utf-8")
    text = text.replace("CODE_SIGN_STYLE = Automatic;", "CODE_SIGN_STYLE = Manual;")
    text = re.sub(r"DEVELOPMENT_TEAM = [^;]*;", 'DEVELOPMENT_TEAM = "";', text)
    text = re.sub(r'CODE_SIGN_IDENTITY = "[^"]*";', 'CODE_SIGN_IDENTITY = "-";', text)
    pbx.write_text(text, encoding="utf-8")
    print("patched", pbx)
PY

derived="$PWD/$apple_dir/DerivedData"
mkdir -p "$derived"

common=(
  "${selector[@]}"
  -scheme "$scheme"
  -configuration Debug
  -sdk iphoneos
  -derivedDataPath "$derived"
  ARCHS=arm64
  ONLY_ACTIVE_ARCH=NO
  CODE_SIGN_STYLE=Manual
  CODE_SIGNING_ALLOWED=NO
  CODE_SIGNING_REQUIRED=NO
  CODE_SIGN_IDENTITY=-
  DEVELOPMENT_TEAM=
  PROVISIONING_PROFILE=
  PROVISIONING_PROFILE_SPECIFIER=
)

set +e
xcodebuild "${common[@]}" build
status=$?
set -e
if [[ "$status" -ne 0 ]]; then
  echo "xcodebuild exited $status"
  exit "$status"
fi

app="$(find "$derived/Build/Products" -name '*.app' ! -name '*Tests*' | head -n 1 || true)"
if [[ -z "$app" ]]; then
  echo "No .app produced"
  find "$derived" -name '*.app' -print || true
  exit 1
fi
echo "Using app $app"

work="$(mktemp -d)"
mkdir -p "$work/Payload"
cp -R "$app" "$work/Payload/"
mkdir -p "$apple_dir/build"
ipa="$PWD/$apple_dir/build/zhizhen-dianming.ipa"
rm -f "$ipa"
(cd "$work" && zip -qry "$ipa" Payload)
echo "Wrote $ipa"
ls -lh "$ipa"
