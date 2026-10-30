#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PORT="${1:-4173}"
URL="http://127.0.0.1:${PORT}/"

if ! command -v python3 >/dev/null 2>&1; then
  echo "需要 Python 3 才能启动本地 HTTP 服务。" >&2
  echo "也可以使用任意静态服务器，例如：npx serve ." >&2
  exit 1
fi

echo ""
echo "  ANTHOS · 指尖生花"
echo "  ${URL}"
echo "  按 Ctrl+C 结束服务"
echo ""

if [[ "${NO_OPEN:-0}" != "1" ]]; then
  (
    sleep 1
    if command -v open >/dev/null 2>&1; then
      open "$URL"
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$URL" >/dev/null 2>&1 || true
    fi
  ) &
fi

exec python3 -m http.server "$PORT" --bind 127.0.0.1
