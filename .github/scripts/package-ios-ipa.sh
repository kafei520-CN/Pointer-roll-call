#!/usr/bin/env bash
set -euo pipefail

apple_dir="src-tauri/gen/apple"
if [[ ! -d "$apple_dir" ]]; then
  echo "Missing $apple_dir"
  exit 1
fi

echo "Apple project tree:"
find "$apple_dir" -maxdepth 3 -print

proj="$(find "$apple_dir" -maxdepth 2 \( -name '*.xcworkspace' -o -name '*.xcodeproj' \) | head -n 1)"
if [[ -z "$proj" ]]; then
  echo "No Xcode project under $apple_dir"
  exit 1
fi
echo "Using $proj"

if [[ "$proj" == *.xcworkspace ]]; then
  list_flag="-workspace"
  build_flag="-workspace"
else
  list_flag="-project"
  build_flag="-project"
fi

export XCODE_JSON
XCODE_JSON="$(xcodebuild -list $list_flag "$proj" -json)"
echo "$XCODE_JSON"

scheme="$(
  python3 -c '
import json, os, sys
data = json.loads(os.environ["XCODE_JSON"])
root = data.get("project") or data.get("workspace") or {}
schemes = root.get("schemes") or []
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
  exit 1
fi
echo "Using scheme $scheme"

derived="$PWD/$apple_dir/DerivedData"
mkdir -p "$derived"

# Device archive requires an Apple team. Build the iphoneos .app unsigned, then zip IPA.
set +e
xcodebuild \
  $build_flag "$proj" \
  -scheme "$scheme" \
  -configuration Debug \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$derived" \
  ARCHS=arm64 \
  ONLY_ACTIVE_ARCH=NO \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY= \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM= \
  PROVISIONING_PROFILE_SPECIFIER= \
  build
build_status=$?
set -e

if [[ "$build_status" -ne 0 ]]; then
  echo "Unsigned iphoneos build failed ($build_status); retrying with ad-hoc identity"
  xcodebuild \
    $build_flag "$proj" \
    -scheme "$scheme" \
    -configuration Debug \
    -sdk iphoneos \
    -destination "generic/platform=iOS" \
    -derivedDataPath "$derived" \
    ARCHS=arm64 \
    ONLY_ACTIVE_ARCH=NO \
    CODE_SIGN_IDENTITY=- \
    CODE_SIGNING_ALLOWED=YES \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_STYLE=Manual \
    DEVELOPMENT_TEAM= \
    PROVISIONING_PROFILE_SPECIFIER= \
    build
fi

app="$(find "$derived/Build/Products" -name '*.app' | grep -v Tests | grep iphoneos | head -n 1 || true)"
if [[ -z "$app" ]]; then
  app="$(find "$derived" -name '*.app' | grep -v Tests | head -n 1 || true)"
fi
if [[ -z "$app" ]]; then
  echo "No .app under $derived"
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
