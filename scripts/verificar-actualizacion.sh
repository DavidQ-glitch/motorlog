#!/usr/bin/env bash
# Verifica una actualización igual que lo hace el teléfono, usando SOLO la clave pública.
# Uso: verificar-actualizacion.sh <version.json> <bundle.enc> <clave_publica_spki.b64> [zip_original]
set -euo pipefail
VJ="$1"; ENC="$2"; PUB_B64="$3"; ORIG="${4:-}"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
hex() { od -An -tx1 -v "$1" | tr -d ' \n'; }
fail() { echo "VERIFICACIÓN FALLIDA: $*" >&2; exit 1; }

base64 -d < "$PUB_B64" > "$T/pub.der"
openssl pkey -pubin -inform DER -in "$T/pub.der" -out "$T/pub.pem"

jq -r '.signed.payload' "$VJ" | base64 -d > "$T/payload.json"
jq -r '.signed.sig' "$VJ" | base64 -d > "$T/payload.sig"
openssl dgst -sha256 -verify "$T/pub.pem" -signature "$T/payload.sig" "$T/payload.json" > /dev/null \
  || fail "la firma de version.json no corresponde a la clave"

SESSION=$(jq -r '.sessionKey' "$T/payload.json")
printf '%s' "${SESSION%%:*}" | base64 -d > "$T/iv.bin"
printf '%s' "${SESSION#*:}" | base64 -d > "$T/aes.sig"
openssl pkeyutl -verifyrecover -pubin -inkey "$T/pub.pem" -pkeyopt rsa_padding_mode:pkcs1 -in "$T/aes.sig" -out "$T/aes.key" \
  || fail "no se pudo recuperar la clave del paquete"
openssl enc -d -aes-128-cbc -K "$(hex "$T/aes.key")" -iv "$(hex "$T/iv.bin")" -in "$ENC" -out "$T/bundle.zip" \
  || fail "no se pudo descifrar el paquete"

jq -r '.checksum' "$T/payload.json" | base64 -d > "$T/sum.sig"
openssl pkeyutl -verifyrecover -pubin -inkey "$T/pub.pem" -pkeyopt rsa_padding_mode:pkcs1 -in "$T/sum.sig" -out "$T/sum.bin" \
  || fail "no se pudo recuperar la huella firmada"
SIGNED_SHA=$(base64 -w0 "$T/sum.bin")
REAL_SHA=$(sha256sum "$T/bundle.zip" | cut -d' ' -f1)
[ "$SIGNED_SHA" = "$REAL_SHA" ] || fail "la huella del paquete no coincide"
[ "$(jq -r '.sha256' "$T/payload.json")" = "$REAL_SHA" ] || fail "sha256 informado distinto"
if [ -n "$ORIG" ]; then cmp -s "$T/bundle.zip" "$ORIG" || fail "el paquete descifrado no es el original"; fi
echo "OK: firma válida, paquete íntegro (sha256 ${REAL_SHA})"
