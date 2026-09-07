#!/usr/bin/env bash
# Compile @froggy/ui's Tailwind 4 source into the static stylesheet design-sync ships.
#
# Why this exists: packages/ui/src/styles/globals.css is Tailwind SOURCE
# (@import "tailwindcss", @theme, 40+ @utility rules). Nothing in packages/ui
# compiles it -- only apps/web's @tailwindcss/vite does, at app build time. The
# design-sync bundle needs real CSS, so we compile it here.
#
# Output lands inside packages/ui because cfg.cssEntry is bounded to the package
# dir, and the fontsource @font-face url(./files/...) paths are left un-rebased
# by the Tailwind CLI -- so the referenced font files are copied next to the
# output, where the converter's extractFonts() resolves them.
set -euo pipefail
cd "$(dirname "$0")/.."

# The converter resolves the DS through <node-modules>/<pkg>. Bun's isolated
# installs create no workspace self-link, so @froggy/ui is absent from every
# node_modules in the repo and lib/dts.mjs crashes on its missing package.json.
# Recreate the link here -- it is machine state (gitignored), so every fresh
# clone needs it and this is the step that always runs before the converter.
mkdir -p packages/ui/node_modules/@froggy
ln -sfn ../.. packages/ui/node_modules/@froggy/ui

OUT_DIR=packages/ui/.ds-generated
CSS="$OUT_DIR/ds-compiled.css"
mkdir -p "$OUT_DIR/files"

node .ds-sync/node_modules/@tailwindcss/cli/dist/index.mjs \
  -i .design-sync/tailwind-entry.css -o "$CSS"

# Resolve every url(./files/<name>) against the fontsource packages and copy it in.
missing=0
for f in $(grep -o 'url(\./files/[^)]*)' "$CSS" | sed 's|url(\./files/||; s|)||' | sort -u); do
  src=$(find -L packages/ui/node_modules/@fontsource packages/ui/node_modules/@fontsource-variable \
        -name "$f" -type f 2>/dev/null | head -1)
  if [ -n "$src" ]; then cp -f "$src" "$OUT_DIR/files/$f"; else echo "! font not found: $f"; missing=1; fi
done

echo "css: $(du -h "$CSS" | cut -f1)  fonts: $(ls -1 "$OUT_DIR/files" | wc -l | tr -d ' ')"
exit $missing
