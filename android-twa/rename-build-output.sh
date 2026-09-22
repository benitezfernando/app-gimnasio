#!/usr/bin/env bash
# Corre esto despues de `npx @bubblewrap/cli build` para copiar el APK/AAB
# generados a un nombre que incluye la version (facilita distinguir cual
# es el ultimo build al pasarlo al celular). Usa appVersionName (el
# semver de apps/web/package.json, sincronizado con ./sync-version.sh),
# no el appVersionCode interno.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(grep -o '"appVersionName": *"[^"]*"' twa-manifest.json | grep -o '[0-9][0-9.]*')

if [ -z "$VERSION" ]; then
  echo "No se pudo leer appVersionName de twa-manifest.json" >&2
  exit 1
fi

cp app-release-signed.apk "app-release-signed-v${VERSION}.apk"
cp app-release-bundle.aab "app-release-bundle-v${VERSION}.aab"

echo "Listo: app-release-signed-v${VERSION}.apk / app-release-bundle-v${VERSION}.aab"
