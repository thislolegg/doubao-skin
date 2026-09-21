#!/bin/bash

requested_doubao_client() {
  local previous=""
  local argument
  for argument in "$@"; do
    if [ "$previous" = "--client" ]; then
      echo "$argument"
      return
    fi
    case "$argument" in
      --client=*)
        echo "${argument#--client=}"
        return
        ;;
    esac
    previous="$argument"
  done
  if [ "$previous" = "--client" ]; then
    echo "--client 缺少值" >&2
    return 2
  fi

  if [ -n "${DOUBAO_CLIENT:-}" ]; then
    echo "$DOUBAO_CLIENT"
    return
  fi
  return 1
}

doubao_client_from_ancestors() {
  local pid="$PPID"
  local command
  local parent
  local depth=0

  while [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null && [ "$depth" -lt 20 ]; do
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    case "$command" in
      *"/DoubaoWork.app/"*) echo "work"; return ;;
      *"/Doubao.app/"*) echo "personal"; return ;;
    esac
    parent="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    [ -n "$parent" ] || break
    pid="$parent"
    depth=$((depth + 1))
  done
  return 1
}

doubao_client_from_root() {
  case "$1" in
    *"/Library/Application Support/DoubaoWork/"*|*"/.doubaowork/"*)
      echo "work"
      ;;
    *"/Library/Application Support/Doubao/"*|*"/.doubao/"*)
      echo "personal"
      ;;
    *)
      return 1
      ;;
  esac
}

doubao_client_is_running() {
  case "$1" in
    personal)
      pgrep -f '/Applications/Doubao[.]app/Contents/MacOS/Doubao([[:space:]]|$)' >/dev/null 2>&1
      ;;
    work)
      pgrep -f '/Applications/DoubaoWork[.]app/Contents/MacOS/DoubaoWork([[:space:]]|$)' >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

detect_doubao_client() {
  local root="$1"
  shift
  local client
  local requested_status

  if client="$(requested_doubao_client "$@")"; then
    case "$client" in
      personal|work)
        echo "$client"
        return
        ;;
      *)
        echo "DOUBAO_CLIENT/--client 必须是 personal 或 work" >&2
        return 2
        ;;
    esac
  else
    requested_status=$?
    [ "$requested_status" -ne 2 ] || return 2
  fi
  if client="$(doubao_client_from_ancestors)"; then
    echo "$client"
    return
  fi
  if client="$(doubao_client_from_root "$root")"; then
    echo "$client"
    return
  fi

  if doubao_client_is_running work && ! doubao_client_is_running personal; then
    echo "work"
    return
  fi
  if doubao_client_is_running personal && ! doubao_client_is_running work; then
    echo "personal"
    return
  fi

  echo "personal"
}

configure_doubao_client() {
  DOUBAO_CLIENT_ID="$1"
  case "$DOUBAO_CLIENT_ID" in
    personal)
      DOUBAO_CLIENT_NAME="豆包"
      DOUBAO_APP="${DOUBAO_APP:-/Applications/Doubao.app}"
      DOUBAO_EXECUTABLE="${DOUBAO_EXECUTABLE:-Doubao}"
      DOUBAO_BUNDLE_ID="${DOUBAO_BUNDLE_ID:-com.bot.pc.doubao}"
      DOUBAO_RENDERER_HINT="${DOUBAO_RENDERER_HINT:-doubao-chat}"
      DOUBAO_CDP_PORT="${DOUBAO_CDP_PORT:-9333}"
      ;;
    work)
      DOUBAO_CLIENT_NAME="豆包工作"
      DOUBAO_APP="${DOUBAO_APP:-/Applications/DoubaoWork.app}"
      DOUBAO_EXECUTABLE="${DOUBAO_EXECUTABLE:-DoubaoWork}"
      DOUBAO_BUNDLE_ID="${DOUBAO_BUNDLE_ID:-com.work.pc.doubao}"
      DOUBAO_RENDERER_HINT="${DOUBAO_RENDERER_HINT:-doubaowork-chat}"
      DOUBAO_CDP_PORT="${DOUBAO_CDP_PORT:-9334}"
      ;;
    *)
      echo "无法识别的豆包客户端：$DOUBAO_CLIENT_ID" >&2
      return 1
      ;;
  esac
  DOUBAO_BIN="${DOUBAO_BIN:-$DOUBAO_APP/Contents/MacOS/$DOUBAO_EXECUTABLE}"
}
