#!/bin/bash
# doubao-skin 一键安装脚本
# ---------------------------------------------------------------------------
# 作用：把本 skill 拉取到豆包 / 豆包工作 Agent Mode 的 .user_skills 目录，
#       让客户端里的 Agent 一说「换肤」就能找到并运行它。
#
# 用法（终端，二选一）：
#   curl -fsSL https://raw.githubusercontent.com/OWNER/doubao-skin/main/install.sh | bash
#   bash install.sh
#
# 自定义仓库地址 / 分支（可选）：
#   DOUBAO_SKIN_REPO=https://github.com/OWNER/doubao-skin.git \
#   DOUBAO_SKIN_BRANCH=main  bash install.sh
#
# 安装后：到豆包 / 豆包工作里说一句「帮我换肤」，Agent 会自动完成。
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_URL="${DOUBAO_SKIN_REPO:-https://github.com/OWNER/doubao-skin.git}"
BRANCH="${DOUBAO_SKIN_BRANCH:-main}"
SKILL_NAME="doubao-skin"

command -v git >/dev/null 2>&1 || { echo "❌ 未检测到 git，请先安装 git 后重试" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) ;;
  *) echo "❌ 本脚本仅适用于 macOS；Windows 请改用 scripts/apply.ps1（见 README）" >&2; exit 1 ;;
esac

# 收集所有实际存在的 Agent workspace（豆包工作在前，豆包在后）。
# 目录里的 * 是客户端的版本 / 用户目录，可能有多个，逐一安装以确保命中当前在用的那个。
shopt -s nullglob
workspaces=()
for ws in \
  "$HOME/Library/Application Support/DoubaoWork"/*/.doubaowork/agent_mode/workspace \
  "$HOME/Library/Application Support/Doubao"/*/.doubao/agent_mode/workspace
do
  [ -d "$ws" ] && workspaces+=("$ws")
done

if [ ${#workspaces[@]} -eq 0 ]; then
  echo "❌ 未找到豆包 / 豆包工作的 Agent workspace。" >&2
  echo "   请先安装桌面端，并至少进入一次 Agent Mode（对话）再重试。" >&2
  exit 1
fi

installed=()
for ws in "${workspaces[@]}"; do
  mkdir -p "$ws/.user_skills"
  dest="$ws/.user_skills/$SKILL_NAME"

  if [ -d "$dest/.git" ]; then
    echo "↻ 已存在，更新：$dest"
    git -C "$dest" fetch --depth 1 origin "$BRANCH"
    git -C "$dest" reset --hard "origin/$BRANCH"
  elif [ -e "$dest" ]; then
    backup="$dest.bak.$(date +%Y%m%d%H%M%S)"
    echo "⚠️  发现非 git 版本，先备份到：$backup"
    mv "$dest" "$backup"
    echo "⇣ 安装：$dest"
    git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$dest"
  else
    echo "⇣ 安装：$dest"
    git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$dest"
  fi
  installed+=("$dest")
done

echo
echo "✅ doubao-skin 已就位："
printf '   %s\n' "${installed[@]}"
echo
echo "现在到豆包 / 豆包工作里说一句「帮我换肤」即可。"
echo "（也可直接运行：bash \"${installed[0]}/scripts/apply.command\"）"
