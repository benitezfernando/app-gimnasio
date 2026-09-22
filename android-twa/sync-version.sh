#!/usr/bin/env bash
# Sincroniza la version de apps/web/package.json (fuente de verdad) hacia
# android-twa/twa-manifest.json antes de generar un build nuevo.
#
# appVersionName: el mismo string semver de package.json (ej. "1.2.3"),
# es lo que ve el usuario en Play Store / Ajustes > Apps.
#
# appVersionCode: Play Store exige un ENTERO que suba siempre en cada
# version publicada -- no puede ser el string semver directamente. Se
# deriva con major*10000 + minor*100 + patch, asumiendo minor y patch
# menores a 100 (mas que suficiente para este proyecto). Si algun
# componente llega a 100, hay que resolverlo a mano.
set -euo pipefail
cd "$(dirname "$0")"

PACKAGE_JSON="../apps/web/package.json"
MANIFEST="twa-manifest.json"

VERSION=$(grep -o '"version": *"[^"]*"' "$PACKAGE_JSON" | head -1 | grep -o '[0-9]*\.[0-9]*\.[0-9]*')

if [ -z "$VERSION" ]; then
  echo "No se pudo leer la version de $PACKAGE_JSON" >&2
  exit 1
fi

MAJOR=$(echo "$VERSION" | cut -d. -f1)
MINOR=$(echo "$VERSION" | cut -d. -f2)
PATCH=$(echo "$VERSION" | cut -d. -f3)

if [ "$MINOR" -ge 100 ] || [ "$PATCH" -ge 100 ]; then
  echo "minor o patch >= 100 ($VERSION) -- la formula de versionCode ya no es segura, resolver a mano." >&2
  exit 1
fi

VERSION_CODE=$((MAJOR * 10000 + MINOR * 100 + PATCH))

python3 - "$MANIFEST" "$VERSION" "$VERSION_CODE" <<'EOF'
import json
import sys

manifest_path, version, version_code = sys.argv[1], sys.argv[2], int(sys.argv[3])

with open(manifest_path) as f:
    manifest = json.load(f)

manifest["appVersionName"] = version
manifest["appVersionCode"] = version_code
manifest["appVersion"] = version

with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
EOF

echo "twa-manifest.json actualizado: appVersionName=$VERSION appVersionCode=$VERSION_CODE"
echo "Ahora corre: npx @bubblewrap/cli update --skipVersionUpgrade && npx @bubblewrap/cli build && ./rename-build-output.sh"
