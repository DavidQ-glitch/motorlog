#!/usr/bin/env bash
# Cifra y firma una actualización de MotorLog con TU clave privada.
# Solo quien tiene la clave (el Secret KEYSTORE_BASE64) puede generar una actualización
# que el teléfono acepte.
#
# Uso:   firmar-actualizacion.sh <clave_privada.pem> <bundle.zip> <carpeta_salida>
# Variables de entorno: REPO, BUILD, VERSION, MIN_NATIVE, NOTES
# Salida: <carpeta_salida>/bundle.enc y <carpeta_salida>/version.json
set -euo pipefail
KEY="$1"; ZIP="$2"; OUT="$3"
: "${REPO:?}" "${BUILD:?}" "${VERSION:?}" "${MIN_NATIVE:?}"
NOTES="${NOTES:-Mejoras y correcciones}"
mkdir -p "$OUT"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
hex() { od -An -tx1 -v "$1" | tr -d ' \n'; }
BASE="https://github.com/${REPO}/releases/download/v${BUILD}"

# 1) Huella SHA-256 del paquete original
SHA=$(sha256sum "$ZIP" | cut -d' ' -f1)

# 2) Cifrado del paquete con una clave AES nueva (AES-128-CBC, formato del plugin)
openssl rand 16 > "$T/aes.key"
openssl rand 16 > "$T/iv.bin"
openssl enc -aes-128-cbc -K "$(hex "$T/aes.key")" -iv "$(hex "$T/iv.bin")" -in "$ZIP" -out "$OUT/bundle.enc"

# 3) La clave AES y la huella se firman con la clave privada (el teléfono las recupera con la pública)
openssl pkeyutl -sign -inkey "$KEY" -pkeyopt rsa_padding_mode:pkcs1 -in "$T/aes.key" -out "$T/aes.sig"
printf '%s' "$SHA" | base64 -d > "$T/sum.bin"
openssl pkeyutl -sign -inkey "$KEY" -pkeyopt rsa_padding_mode:pkcs1 -in "$T/sum.bin" -out "$T/sum.sig"
SESSION="$(base64 -w0 "$T/iv.bin"):$(base64 -w0 "$T/aes.sig")"
CHECKSUM=$(base64 -w0 "$T/sum.sig")

# 4) Datos de la versión, firmados (la app no acepta nada que no esté firmado)
jq -n -c \
  --arg app "com.motorlog.app" --arg repo "$REPO" --argjson build "$BUILD" --arg version "$VERSION" \
  --arg apk "${BASE}/MotorLog.apk" --arg bundle "${BASE}/bundle.enc" \
  --arg sessionKey "$SESSION" --arg checksum "$CHECKSUM" --arg sha256 "$SHA" \
  --argjson minNative "$MIN_NATIVE" --arg notes "$NOTES" \
  '{app:$app, repo:$repo, build:$build, version:$version, apk:$apk, bundle:$bundle,
    sessionKey:$sessionKey, checksum:$checksum, sha256:$sha256, minNative:$minNative, notes:$notes}' \
  > "$T/payload.json"
openssl dgst -sha256 -sign "$KEY" -out "$T/payload.sig" "$T/payload.json"

# 5) version.json: campos simples (los lee la app vieja para ofrecer el APK) + bloque firmado
jq -n \
  --argjson build "$BUILD" --arg version "$VERSION" --arg apk "${BASE}/MotorLog.apk" \
  --argjson minNative "$MIN_NATIVE" --arg notes "$NOTES" \
  --arg payload "$(base64 -w0 "$T/payload.json")" --arg sig "$(base64 -w0 "$T/payload.sig")" \
  '{build:$build, version:$version, apk:$apk, minNative:$minNative, notes:$notes,
    signed:{alg:"RS256", payload:$payload, sig:$sig}}' > "$OUT/version.json"
echo "Actualización ${VERSION} cifrada y firmada (sha256 ${SHA})"
