#!/bin/bash
# Doubao Skin Studio — 暂停皮肤，恢复原生界面（不重启客户端）
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/client-config.command"

CLIENT="$(detect_doubao_client "$ROOT" "$@")"
configure_doubao_client "$CLIENT"
PORT="$DOUBAO_CDP_PORT"

NODE=""
if command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
else
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$candidate" ]; then NODE="$candidate"; break; fi
  done
fi
[ -z "$NODE" ] && { echo "未找到 node，请先安装 Node.js 18+" >&2; exit 1; }

echo "已识别调用客户端：$DOUBAO_CLIENT_NAME"
exec "$NODE" "$ROOT/src/cli.mjs" pause --client "$DOUBAO_CLIENT_ID" --port "$PORT" "$@"
