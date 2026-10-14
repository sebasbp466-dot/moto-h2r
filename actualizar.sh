#!/usr/bin/env bash
# Sube el proyecto, espera a GitHub Actions, desinstala la versión vieja con root e instala la nueva.
set -e
cd "$(dirname "$0")"
PKG=com.termux.motoh2r

git config user.email >/dev/null 2>&1 || git config user.email "moto@example.com"
git config user.name >/dev/null 2>&1 || git config user.name "moto"
[ -d .git ] || git init -q -b main
git add -A
git commit -qm "Actualizacion $(date +%F-%H%M)" || true

if git remote get-url origin >/dev/null 2>&1; then
  git push -q origin HEAD:main
else
  gh repo create moto-h2r --public --source=. --remote=origin --push
fi

echo ">> Esperando a que GitHub empiece a compilar..."
SHA=$(git rev-parse HEAD)
ID=""
for i in $(seq 1 25); do
  ID=$(gh run list --commit "$SHA" --limit 1 --json databaseId -q '.[0].databaseId // empty' 2>/dev/null || true)
  [ -n "$ID" ] && break
  sleep 3
done
if [ -z "$ID" ]; then
  echo ">> Sin cambios nuevos: lanzo la compilación a mano"
  gh workflow run build.yml
  sleep 8
  ID=$(gh run list --workflow build.yml --limit 1 --json databaseId -q '.[0].databaseId')
fi

echo ">> Compilando (5-8 min)... run $ID"
gh run watch "$ID" --exit-status || { echo "FALLÓ. Mira el error con: gh run view $ID --log-failed"; exit 1; }

OUT="$HOME/apk_out"
rm -rf "$OUT"; mkdir -p "$OUT"
gh run download "$ID" -n moto-h2r-apk -D "$OUT"
cp "$OUT/app-debug.apk" "$HOME/storage/downloads/MotoPirueta.apk" 2>/dev/null || true

echo ">> Instalando con root (desinstala la vieja primero)..."
su -c "pm uninstall $PKG >/dev/null 2>&1; cp '$OUT/app-debug.apk' /data/local/tmp/mp.apk && chmod 644 /data/local/tmp/mp.apk && pm install -r /data/local/tmp/mp.apk && rm -f /data/local/tmp/mp.apk && monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1"
echo ">> Listo: Moto Pirueta Briceño instalado y abierto."
