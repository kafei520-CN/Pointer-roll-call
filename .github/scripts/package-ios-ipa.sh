#!/usr/bin/env bash
# Unsigned release IPA for enterprise signing and 爱思:
#   1. tauri ios init (workflow)
#   2. sed pbxproj: Manual signing, empty team/cert
#   3. keep `tauri ios build --open` alive for cli-options-server.json
#   4. xcodebuild release + CODE_SIGNING_ALLOWED=NO (no archive/export)
#   5. Payload/*.app -> zip IPA
#
# A debug build is a 70KB stub plus 指针点名.debug.dylib. Enterprise
# signers sign the stub, and iOS kills the app as soon as it opens.
set -euo pipefail

export CI=true
export CODE_SIGNING_ALLOWED=NO
export CODE_SIGNING_REQUIRED=NO
export CODE_SIGN_IDENTITY=""

apple_dir="src-tauri/gen/apple"
pbx="$apple_dir/zhizhen-dianming.xcodeproj/project.pbxproj"
scheme="zhizhen-dianming_iOS"
derived="$PWD/$apple_dir/DerivedData"
ipa="$PWD/$apple_dir/build/zhizhen-dianming.ipa"

echo "Xcode $(xcodebuild -version | tr '\n' ' ')"
ls -la "$apple_dir"

if [[ ! -f "$pbx" ]]; then
  echo "missing $pbx"
  find "$apple_dir" -name 'project.pbxproj' -print
  exit 1
fi

# Force manual signing and wipe team/certificate. Do not use identity "-"
# (Xcode 26 rejects Ad Hoc).
sed -i '' \
  -e 's/CODE_SIGN_STYLE = Automatic;/CODE_SIGN_STYLE = Manual;/g' \
  -e 's/ProvisioningStyle = Automatic;/ProvisioningStyle = Manual;/g' \
  -e 's/DEVELOPMENT_TEAM = [^;]*;/DEVELOPMENT_TEAM = "";/g' \
  -e 's/CODE_SIGN_IDENTITY = "[^"]*";/CODE_SIGN_IDENTITY = "";/g' \
  "$pbx"
echo "patched $pbx"

# Skip CocoaPods: the generated Podfile lists a missing zhizhen-dianming_macOS
# target and has no actual dependencies.

# Xcode "Build Rust Code" reads gen/apple/.tauri/cli-options-server.json
# written by `tauri ios build` / `tauri ios dev`. --open keeps the CLI
# (and the RPC server) running without archiving.
npx tauri ios build --ci --open > tauri-ios-open.log 2>&1 &
tauri_pid=$!
cleanup() {
  kill "$tauri_pid" 2>/dev/null || true
  wait "$tauri_pid" 2>/dev/null || true
}
trap cleanup EXIT

server_json="$apple_dir/.tauri/cli-options-server.json"
echo "waiting for $server_json"
for _ in $(seq 1 90); do
  if [[ -f "$server_json" ]]; then
    echo "options server ready: $(cat "$server_json")"
    break
  fi
  if ! kill -0 "$tauri_pid" 2>/dev/null; then
    echo "tauri ios build --open exited early"
    cat tauri-ios-open.log || true
    break
  fi
  sleep 1
done
if [[ ! -f "$server_json" ]]; then
  echo "cli-options-server.json was not created"
  cat tauri-ios-open.log || true
  ls -la "$apple_dir/.tauri" || true
  exit 1
fi

mkdir -p "$derived"

set +e
xcodebuild \
  -project "$apple_dir/zhizhen-dianming.xcodeproj" \
  -scheme "$scheme" \
  -configuration release \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$derived" \
  ARCHS=arm64 \
  ONLY_ACTIVE_ARCH=NO \
  ENABLE_DEBUG_DYLIB=NO \
  ENABLE_PREVIEWS=NO \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGN_ENTITLEMENTS="" \
  CODE_SIGNING_INJECT_BASE_ENTITLEMENTS=NO \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="" \
  build
xcode_status=$?
set -e
echo "xcodebuild build exited $xcode_status"

app=""
while IFS= read -r line; do
  app="$line"
  break
done < <(find "$derived/Build/Products/release-iphoneos" -name '*.app' ! -name '*Tests*' 2>/dev/null)
if [[ -z "$app" ]]; then
  echo "no release-iphoneos app"
  find "$derived/Build/Products" -name '*.app' -print || true
  exit 1
fi

# 65 = xcodebuild failure; continue if the .app still exists.
if [[ "$xcode_status" -ne 0 && "$xcode_status" -ne 65 ]]; then
  echo "unexpected xcodebuild status $xcode_status"
  exit "$xcode_status"
fi
if [[ -z "$app" ]]; then
  echo "no .app after xcodebuild (status $xcode_status)"
  find "$derived" -name '*.app' -print || true
  exit 1
fi
echo "using app $app"
find "$app" -type f -exec ls -lh {} \;

if find "$app" \( -name '*.debug.dylib' -o -name '__preview.dylib' \) | grep -q .; then
  echo "refusing to pack a debug-dylib app; enterprise signing cannot launch it"
  exit 1
fi
exe="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Info.plist")"
exe_size="$(stat -f%z "$app/$exe")"
echo "executable $exe is $exe_size bytes"
if [[ "$exe_size" -lt 1000000 ]]; then
  echo "executable is only a stub, so the release build did not link the app"
  exit 1
fi

mkdir -p "$apple_dir/build"
work="$(mktemp -d)"
mkdir -p "$work/Payload"
cp -R "$app" "$work/Payload/"
rm -f "$ipa"
(cd "$work" && zip -qry "$ipa" Payload)
echo "wrote $ipa"
ls -lh "$ipa"
echo "unsigned release IPA; enterprise or 爱思 signing can install it"
