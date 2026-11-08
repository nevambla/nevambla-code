#!/usr/bin/env bash
# Install nevambla-code:
#   1. herdr/config.toml      -> ~/.config/herdr/config.toml        (herdr, the terminal app)
#   2. herdr-app/             -> ~/.config/herdr-app                 (the herdr desktop window)
#      the nevambla-code layout, its vsc-* mods, the dracula theme and its shortcuts
#   3. fonts/                 -> your user font folder               (JetBrainsMono Nerd Font)
# Anything it would replace is backed up first to ~/.config/nevambla-code-backups/<time>/.
# Shortcuts are merged: keys you already use are never replaced.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}"
HERDR="$CONFIG/herdr"
APP="$CONFIG/herdr-app"
BACKUP="$CONFIG/nevambla-code-backups/$(date +%Y%m%d-%H%M%S)"

say()  { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }

# Copy $1 to $2, backing up $2 first if it exists and differs.
put() {
  local src="$1" dest="$2" rel="${2#"$CONFIG"/}"
  if [ -e "$dest" ]; then
    if diff -rq "$src" "$dest" >/dev/null 2>&1; then return 0; fi
    mkdir -p "$BACKUP/$(dirname "$rel")"
    cp -R "$dest" "$BACKUP/$rel"
    rm -rf "$dest"
  fi
  mkdir -p "$(dirname "$dest")"
  cp -R "$src" "$dest"
}

# 1. Terminal config -----------------------------------------------------------
if command -v herdr >/dev/null 2>&1; then
  put "$REPO/herdr/config.toml" "$HERDR/config.toml"
  say "Installed herdr config: $HERDR/config.toml"
  herdr config check || true
  herdr server reload-config >/dev/null 2>&1 && say "Reloaded the running herdr server" || true
else
  warn "herdr is not installed (brew install herdr); skipped the terminal config"
fi

# 2. Desktop layout ------------------------------------------------------------
if [ -d "$APP" ]; then
  put "$REPO/herdr-app/layouts/nevambla-code.json" "$APP/layouts/nevambla-code.json"
  put "$REPO/herdr-app/themes/dracula.json" "$APP/themes/dracula.json"
  for mod in "$REPO"/herdr-app/mods/*/; do
    name="$(basename "$mod")"
    put "${mod%/}" "$APP/mods/$name"
  done

  # Merge shortcuts: add missing sections and keys, keep the person's own on a clash.
  [ -f "$APP/keys.json" ] && { mkdir -p "$BACKUP"; cp "$APP/keys.json" "$BACKUP/herdr-app-keys.json"; }
  python3 - "$REPO/herdr-app/keys.json" "$APP/keys.json" <<'EOF'
import json, os, sys
src, dest = sys.argv[1], sys.argv[2]
new = json.load(open(src))
cur = json.load(open(dest)) if os.path.exists(dest) else {}
for section, keys in new.items():
    have = cur.setdefault(section, {})
    for key, action in keys.items():
        if key not in have:
            have[key] = action
        elif have[key] != action:
            print(f"warning: kept your {section} {key} = {have[key]!r} (this layout uses {action!r})", file=sys.stderr)
json.dump(cur, open(dest, "w"), indent=2)
open(dest, "a").write("\n")
EOF
  say "Installed the nevambla-code layout, its mods and the dracula theme in $APP"

  if command -v herdr-app >/dev/null 2>&1; then
    for mod in "$REPO"/herdr-app/mods/*/; do
      herdr-app check "mods/$(basename "$mod")" >/dev/null 2>&1 || warn "herdr-app check failed for $(basename "$mod")"
    done
    herdr-app do layout.switch '{"name":"nevambla-code"}' >/dev/null 2>&1 \
      && say "Switched the open herdr window to nevambla-code" \
      || say "Open herdr and pick nevambla-code in Settings → Look → Layout (or ctrl-shift-l)"
  fi
else
  warn "$APP not found: open the herdr desktop app once, then run this again to add the layout"
fi

# 3. Font ----------------------------------------------------------------------
case "$(uname -s)" in
  Darwin) FONTS="$HOME/Library/Fonts" ;;
  *)      FONTS="${XDG_DATA_HOME:-$HOME/.local/share}/fonts" ;;
esac
mkdir -p "$FONTS"
for f in "$REPO"/fonts/*.ttf; do
  [ -f "$FONTS/$(basename "$f")" ] || cp "$f" "$FONTS/"
done
command -v fc-cache >/dev/null 2>&1 && fc-cache -f "$FONTS" >/dev/null 2>&1 || true
say "Installed JetBrainsMono Nerd Font in $FONTS"

# Optional tools the editor uses ------------------------------------------------
command -v pdftoppm >/dev/null 2>&1 || say "Optional: brew install poppler  (to view PDFs in the editor)"
python3 -c 'import jupyter_client' >/dev/null 2>&1 || say "Optional: pip install jupyter_client ipykernel  (to run notebooks in the editor)"

[ -d "$BACKUP" ] && say "Replaced files were backed up to $BACKUP"
say "Done."
