#!/bin/bash
# Doubao Skin Studio — 自动识别豆包客户端，按需重启并注入皮肤。
#
# 关键设计：本 skill 会分发给用户，由豆包或豆包工作客户端里的 agent 调用。
# 一旦关闭发起调用的客户端，agent 及其 shell 会被一起终止，所以真正的
# 「关闭客户端→带端口重启→注入」必须放进一个脱离当前 session 的
# 独立后台进程（perl fork+setsid 守护化），launcher 派生它后立刻返回。
# 这样即便杀豆包连累了 agent，worker 仍在独立 session 里把皮肤装回来。

set -e

# 绝对路径，保证 worker 再次 exec 自己时不受 cwd 影响
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SELF="$SCRIPT_DIR/apply.command"
source "$SCRIPT_DIR/client-config.command"

WORKER_MODE=0
if [ "$1" = "--worker" ]; then
  WORKER_MODE=1
  shift
  CLIENT="$1"
  shift
else
  CLIENT="$(detect_doubao_client "$ROOT" "$@")"
fi
configure_doubao_client "$CLIENT"

PORT="$DOUBAO_CDP_PORT"
APP="$DOUBAO_APP"
BIN="$DOUBAO_BIN"
LOG="${DOUBAO_SKIN_LOG:-/tmp/doubao-skin-apply-${DOUBAO_CLIENT_ID}.log}"
CDP_LOG="${DOUBAO_SKIN_CDP_LOG:-/tmp/doubao-skin-cdp-${DOUBAO_CLIENT_ID}.log}"

# 定位 node（优先 PATH，其次常见 nvm 目录），取绝对路径给独立 worker 用
find_node() {
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node; do
    [ -x "$candidate" ] && { echo "$candidate"; return; }
  done
}
NODE="$(find_node)"

cdp_ready() {
  curl -s --max-time 1 "http://127.0.0.1:$PORT/json/list" 2>/dev/null |
    grep -Fq "$DOUBAO_RENDERER_HINT"
}

# ============ worker：真正干活的独立进程 ============
if [ "$WORKER_MODE" = "1" ]; then
  DELAY="${DOUBAO_RESTART_DELAY:-3}"
  echo "[$(date '+%H:%M:%S')] worker 启动，目标：$DOUBAO_CLIENT_NAME，${DELAY}s 后开始换肤"
  sleep "$DELAY"

  if cdp_ready; then
    echo "CDP 已就绪（端口 $PORT），直接注入，无需重启"
  else
    echo "关闭$DOUBAO_CLIENT_NAME..."
    osascript -e "tell application id \"$DOUBAO_BUNDLE_ID\" to quit" 2>/dev/null || true
    for _ in $(seq 1 10); do pgrep -f "$BIN" >/dev/null 2>&1 || break; sleep 1; done
    pkill -f "$BIN" 2>/dev/null || true
    sleep 2

    echo "带调试端口重启$DOUBAO_CLIENT_NAME（端口 $PORT）..."
    nohup "$BIN" --remote-debugging-address=127.0.0.1 --remote-debugging-port="$PORT" \
      >"$CDP_LOG" 2>&1 </dev/null &
    disown

    echo "等待 CDP 就绪..."
    for i in $(seq 1 30); do cdp_ready && { echo "CDP 就绪（${i}s）"; break; }; sleep 1; done
  fi

  echo "注入皮肤..."
  "$NODE" "$ROOT/src/cli.mjs" apply --client "$DOUBAO_CLIENT_ID" --port "$PORT" "$@"
  echo "[$(date '+%H:%M:%S')] 换肤完成"
  exit 0
fi

# ============ launcher：派生独立 worker 后立刻返回 ============
[ -d "$APP" ] || { echo "未找到$DOUBAO_CLIENT_NAME（应在 $APP）" >&2; exit 1; }
[ -x "$BIN" ] || { echo "未找到$DOUBAO_CLIENT_NAME主程序：$BIN" >&2; exit 1; }
[ -n "$NODE" ] || { echo "未找到 node，请先安装 Node.js 18+" >&2; exit 1; }

echo "已识别调用客户端：$DOUBAO_CLIENT_NAME"
echo "即将自动重启$DOUBAO_CLIENT_NAME并加载皮肤，约几秒后完成（应用会短暂关闭再打开）。"
echo "请先保存$DOUBAO_CLIENT_NAME里未保存的内容。"

# perl fork+setsid：把 worker 送进全新 session，脱离当前 agent/shell 的进程组，
# 这样稍后 kill 豆包连累了 agent 也波及不到 worker。macOS 无 setsid 命令，用 perl。
DOUBAO_RESTART_DELAY="${DOUBAO_RESTART_DELAY:-3}" \
  nohup perl -e 'use POSIX qw(setsid); exit if fork; setsid; exec @ARGV;' \
    bash "$SELF" --worker "$DOUBAO_CLIENT_ID" "$@" >"$LOG" 2>&1 </dev/null &
disown

echo "已在后台开始换肤。$DOUBAO_CLIENT_NAME重启后右上角会出现 🎨 按钮。"
echo "如需排查，请查看 $LOG。"
exit 0
