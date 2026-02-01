#!/usr/bin/env bash
set -euo pipefail

# Imports a base64-encoded .p12 into an ephemeral keychain on GitHub Actions runners.
# Outputs:
#   - KEYCHAIN_PATH: $RUNNER_TEMP/build.keychain-db (default)
#
# Required env:
#   - MACOS_CODESIGN_P12_BASE64 (base64-encoded .p12)
#   - MACOS_CODESIGN_P12_PASSWORD
#   - MACOS_KEYCHAIN_PASSWORD

if [[ "${RUNNER_OS:-}" != "macOS" ]]; then
  echo "This script is intended to run on macOS runners only."
  exit 1
fi

if [[ -z "${RUNNER_TEMP:-}" ]]; then
  echo "RUNNER_TEMP is not set (expected on GitHub Actions)."
  exit 1
fi

if [[ -z "${MACOS_CODESIGN_P12_BASE64:-}" || -z "${MACOS_CODESIGN_P12_PASSWORD:-}" || -z "${MACOS_KEYCHAIN_PASSWORD:-}" ]]; then
  echo "Missing required env vars: MACOS_CODESIGN_P12_BASE64, MACOS_CODESIGN_P12_PASSWORD, MACOS_KEYCHAIN_PASSWORD."
  exit 1
fi

KEYCHAIN_PATH="$RUNNER_TEMP/build.keychain-db"
P12_PATH="$RUNNER_TEMP/macos-codesign.p12"

ORIGINAL_KEYCHAINS="$(security list-keychains -d user | tr -d '\"' || true)"

if base64 --help 2>&1 | grep -q -- '--decode'; then
  printf '%s' "$MACOS_CODESIGN_P12_BASE64" | base64 --decode >"$P12_PATH"
else
  printf '%s' "$MACOS_CODESIGN_P12_BASE64" | base64 -D >"$P12_PATH"
fi

security create-keychain -p "$MACOS_KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$MACOS_KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

# Prepend our keychain to the search list so identities are found reliably while keeping system certs available.
# Note: ORIGINAL_KEYCHAINS is a newline-separated list; shell word-splitting is desired here.
# shellcheck disable=SC2086
security list-keychains -d user -s "$KEYCHAIN_PATH" $ORIGINAL_KEYCHAINS
security default-keychain -d user -s "$KEYCHAIN_PATH"

security import "$P12_PATH" -k "$KEYCHAIN_PATH" -P "$MACOS_CODESIGN_P12_PASSWORD" \
  -T /usr/bin/codesign -T /usr/bin/security

# Some exported p12 files contain CA certs but they don't always get imported consistently.
# Import any CA certs and attempt to trust them in this ephemeral keychain to reduce chain warnings.
if command -v openssl >/dev/null 2>&1; then
  CA_PEM="$RUNNER_TEMP/macos-codesign-ca.pem"
  if openssl pkcs12 -in "$P12_PATH" -passin pass:"$MACOS_CODESIGN_P12_PASSWORD" -cacerts -nokeys -out "$CA_PEM" >/dev/null 2>&1; then
    CERT_COUNT="$(awk 'BEGIN{c=0} /BEGIN CERTIFICATE/{c++} END{print c}' "$CA_PEM")"
    if [[ "${CERT_COUNT:-0}" -gt 0 ]]; then
      csplit -s -f "$RUNNER_TEMP/macos-codesign-ca-" -b "%02d.pem" "$CA_PEM" '/-----BEGIN CERTIFICATE-----/' '{*}' || true
      for f in "$RUNNER_TEMP"/macos-codesign-ca-*.pem; do
        [[ -s "$f" ]] || continue
        security import "$f" -k "$KEYCHAIN_PATH" -T /usr/bin/codesign -T /usr/bin/security >/dev/null 2>&1 || true
        security add-trusted-cert -d -r trustRoot -k "$KEYCHAIN_PATH" "$f" >/dev/null 2>&1 || true
      done
    fi
  fi
fi

# Allow `codesign` to access the private key non-interactively on CI.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$MACOS_KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

echo "Imported identities:"
security find-identity -v -p codesigning "$KEYCHAIN_PATH" || true

echo "KEYCHAIN_PATH=$KEYCHAIN_PATH"
