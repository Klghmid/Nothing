#!/usr/bin/env bash
# Wire Studio launcher for Linux and macOS.
#   ./start.sh                       start on http://127.0.0.1:5180 and open the browser
#   PORT=5190 ./start.sh             another port
#   COMFY_URL=http://192.168.1.20:8188 ./start.sh   point at a ComfyUI on another machine
#   ./start.sh --no-browser
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-5180}"
OPEN=1
for arg in "$@"; do
  case "$arg" in
    --no-browser) OPEN=0 ;;
    --help|-h) sed -n '2,7p' "$0"; exit 0 ;;
  esac
done

# Find Node.js (PATH, then the usual version managers).
NODE="$(command -v node || true)"
for candidate in "$HOME/.volta/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -z "$NODE" ] && [ -x "$candidate" ] && NODE="$candidate"
done
if [ -z "$NODE" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; NODE="$(command -v node || true)"; fi
if [ -z "$NODE" ]; then
  echo "Node.js 20 or newer is required: https://nodejs.org" >&2
  exit 1
fi
MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 20 ]; then
  echo "Node.js $("$NODE" -v) is too old; install Node.js 20 or newer (22+ adds live step progress)." >&2
  exit 1
fi

URL="http://127.0.0.1:$PORT"
open_browser() {
  [ "$OPEN" = 1 ] || return 0
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then xdg-open "$URL" >/dev/null 2>&1
  fi
}
if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
  echo "Wire Studio is already running at $URL"
  open_browser
  exit 0
fi
(sleep 1.2; open_browser) &
PORT="$PORT" exec "$NODE" server.mjs
