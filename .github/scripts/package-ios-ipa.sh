#!/usr/bin/env bash
set -euo pipefail

apple_dir="src-tauri/gen/apple"
proj="$(find "$apple_dir" -maxdepth 2 -name '*.xcodeproj' | head -n 1)"
if [[ -z "$proj" ]]; then
  echo "No Xcode project under $apple_dir"
  find "$apple_dir" -maxdepth 4 -print || true
  exit 1
fi

echo "Using project $proj"
export XCODE_JSON="$(xcodebuild -list -project "$proj" -json)"
scheme="$(
  python3 -c '
import json, os, sys
data = json.loads(os.environ["XCODE_JSON"])
schemes = (data.get("project") or {}).get("schemes") or []
for name in schemes:
    if "iOS" in name or "ios" in name:
        print(name)
        sys.exit(0)
if schemes:
    print(schemes[0])
'
)"
if [[ -z "$scheme" ]]; then
  echo "No Xcode scheme found"
  echo "$xcode_json"
  exit 1
fi
echo "Using scheme $scheme"

archive_path="$PWD/$apple_dir/build/pointer.xcarchive"
mkdir -p "$(dirname "$archive_path")"

xcodebuild \
  -project "$proj" \
  -scheme "$scheme" \
  -configuration Debug \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -archivePath "$archive_path" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY=- \
  DEVELOPMENT_TEAM= \
  archive

app="$(find "$archive_path/Products/Applications" -name '*.app' | head -n 1)"
if [[ -z "$app" ]]; then
  echo "Archive produced no .app"
  find "$archive_path" -print || true
  exit 1
fi

work="$(mktemp -d)"
mkdir -p "$work/Payload"
cp -R "$app" "$work/Payload/"
ipa="$PWD/$apple_dir/build/zhizhen-dianming.ipa"
rm -f "$ipa"
(cd "$work" && zip -r "$ipa" Payload)
echo "Wrote $ipa"
ls -lh "$ipa"
