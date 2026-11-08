#!/usr/bin/env bash
# Install this herdr configuration into ~/.config/herdr/config.toml.
# An existing config is backed up first.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/config.toml"
DEST_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/herdr"
DEST="$DEST_DIR/config.toml"

if ! command -v herdr >/dev/null 2>&1; then
  echo "herdr is not installed. Install it first: brew install herdr" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

if [ -f "$DEST" ]; then
  BACKUP="$DEST.bak.$(date +%Y%m%d%H%M%S)"
  cp "$DEST" "$BACKUP"
  echo "Backed up existing config to $BACKUP"
fi

cp "$SRC" "$DEST"
echo "Installed $DEST"

herdr config check || true
herdr server reload-config 2>/dev/null && echo "Reloaded running herdr server" || true
