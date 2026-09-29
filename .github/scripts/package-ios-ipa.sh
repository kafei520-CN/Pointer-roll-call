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

if [[ -f "$apple_dir/Podfile" ]]; then
  (cd "$apple_dir" && pod install)
fi

# Xcode's "Build Rust Code" phase talks to this CLI process.
# Do not pass --export-method: that needs an Apple signing team.
set +e
npx tauri ios build --ci --debug -- \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY=- \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM=
build_status=$?
set -e
echo "tauri ios build exited $build_status"

mkdir -p "$apple_dir/build"
ipa_found="$(find "$apple_dir" -name '*.ipa' | head -n 1 || true)"
if [[ -n "$ipa_found" ]]; then
  cp "$ipa_found" "$apple_dir/build/zhizhen-dianming.ipa"
  echo "Copied IPA $ipa_found"
  ls -lh "$apple_dir/build/zhizhen-dianming.ipa"
  exit 0
fi

app="$(find "$apple_dir" -name '*.app' ! -path '*Tests*' | head -n 1 || true)"
if [[ -z "$app" ]]; then
  echo "No IPA or .app produced"
  find "$apple_dir" -maxdepth 5 -print
  exit 1
fi
echo "Packaging app $app"
work="$(mktemp -d)"
mkdir -p "$work/Payload"
cp -R "$app" "$work/Payload/"
ipa="$PWD/$apple_dir/build/zhizhen-dianming.ipa"
rm -f "$ipa"
(cd "$work" && zip -qry "$ipa" Payload)
echo "Wrote $ipa"
ls -lh "$ipa"
