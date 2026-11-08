#!/bin/sh
# Prints Claude subscription usage as JSON (the data behind Claude Code's /usage).
# No argument: the default login (`claude`). With a config dir (e.g. ~/.claude-work):
# that account's login, which Claude Code keeps under "Claude Code-credentials-<sha256(dir)[:8]>".
# Uses Claude Code's own login from the macOS Keychain; the token never leaves this script.
service="Claude Code-credentials"
if [ -n "$1" ]; then
  service="$service-$(printf '%s' "$1" | shasum -a 256 | cut -c1-8)"
fi
creds=$(security find-generic-password -s "$service" -w 2>/dev/null) || { echo '{"error":"not logged in"}'; exit 0; }
token=$(printf '%s' "$creds" | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["claudeAiOauth"]["accessToken"])' 2>/dev/null) || { echo '{"error":"unreadable login"}'; exit 0; }
curl -s --max-time 10 https://api.anthropic.com/api/oauth/usage \
  -H "Authorization: Bearer $token" -H "anthropic-beta: oauth-2025-04-20" -H "Content-Type: application/json" \
  || echo '{"error":"offline"}'
