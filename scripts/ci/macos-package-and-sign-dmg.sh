#!/usr/bin/env bash
set -euo pipefail

# Creates a *signed* DMG containing a *signed* .app.
# Intended for CI release builds.
#
# Required env:
#   - TARGET_TRIPLE (e.g. x86_64-apple-darwin)
#   - VERSION (e.g. 0.1.40)
#   - MAC_ASSET_ARCH (e.g. x64 or aarch64)
#   - MACOS_KEYCHAIN_PASSWORD
#
# Optional env:
#   - MACOS_CODESIGN_IDENTITY (defaults to "CyberZen Code Signing")
#
# Outputs:
#   - release-assets/CyberZen_${VERSION}_${MAC_ASSET_ARCH}.dmg
#   - release-assets/CyberZen_${VERSION}_${MAC_ASSET_ARCH}.app.tar.gz

if [[ "${RUNNER_OS:-}" != "macOS" ]]; then
  echo "This script is intended to run on macOS runners only."
  exit 1
fi

TARGET_TRIPLE="${TARGET_TRIPLE:-}"
VERSION="${VERSION:-}"
MAC_ASSET_ARCH="${MAC_ASSET_ARCH:-}"

if [[ -z "$TARGET_TRIPLE" || -z "$VERSION" || -z "$MAC_ASSET_ARCH" ]]; then
  echo "Missing required env vars: TARGET_TRIPLE, VERSION, MAC_ASSET_ARCH."
  exit 1
fi

if [[ -z "${RUNNER_TEMP:-}" ]]; then
  echo "RUNNER_TEMP is not set (expected on GitHub Actions)."
  exit 1
fi

KEYCHAIN_PATH="$RUNNER_TEMP/build.keychain-db"
if [[ -z "${MACOS_KEYCHAIN_PASSWORD:-}" ]]; then
  echo "MACOS_KEYCHAIN_PASSWORD is empty (required to unlock the ephemeral keychain)."
  exit 1
fi
security unlock-keychain -p "$MACOS_KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

BUNDLE_DIR="src-tauri/target/${TARGET_TRIPLE}/release/bundle"
if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "Bundle dir not found: $BUNDLE_DIR"
  exit 1
fi

APP_DIR="$(find "$BUNDLE_DIR" -type d -name '*.app' -print -quit || true)"
if [[ -z "$APP_DIR" ]]; then
  echo "Could not find .app under: $BUNDLE_DIR"
  find "$BUNDLE_DIR" -maxdepth 4 -print | sed -n '1,200p'
  exit 1
fi

IDENTITY="${MACOS_CODESIGN_IDENTITY:-CyberZen Code Signing}"

# If we're using a trusted Apple signing identity, request a timestamp. For self-signed identities, avoid it.
TIMESTAMP_FLAG="--timestamp=none"
if [[ "$IDENTITY" == Developer\ ID\ * || "$IDENTITY" == Apple\ * ]]; then
  TIMESTAMP_FLAG="--timestamp"
fi

echo "Signing app: $APP_DIR"
codesign --force --deep --options runtime "$TIMESTAMP_FLAG" --keychain "$KEYCHAIN_PATH" --sign "$IDENTITY" "$APP_DIR"
codesign --verify --deep --strict --verbose=4 "$APP_DIR"
spctl -a -vv --type execute "$APP_DIR" || true

mkdir -p release-assets

echo "Creating DMG containing signed app"
STAGING_DIR="$RUNNER_TEMP/dmg-stage-${TARGET_TRIPLE}"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
cp -R "$APP_DIR" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

DMG_PATH="release-assets/CyberZen_${VERSION}_${MAC_ASSET_ARCH}.dmg"
rm -f "$DMG_PATH"
hdiutil create -volname "CyberZen" -srcfolder "$STAGING_DIR" -ov -format UDZO "$DMG_PATH" >/dev/null

echo "Signing DMG: $DMG_PATH"
codesign --force "$TIMESTAMP_FLAG" --keychain "$KEYCHAIN_PATH" --sign "$IDENTITY" "$DMG_PATH"
codesign --verify --verbose=4 "$DMG_PATH"
spctl -a -vv --type open "$DMG_PATH" || true

echo "Creating updater payload archive from signed app"
UPDATER_ARCHIVE="release-assets/CyberZen_${VERSION}_${MAC_ASSET_ARCH}.app.tar.gz"
tar -czf "$UPDATER_ARCHIVE" -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")"

echo "Created release assets:"
ls -la release-assets
