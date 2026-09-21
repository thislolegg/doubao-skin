---
name: doubao-skin
description: >-
  给豆包、豆包工作桌面端换肤：通过本机 CDP 注入一套可还原的主题。
  当用户想更换 / 应用 / 恢复豆包客户端的主题皮肤，或说「帮我换豆包主题/皮肤」
  「用这个开源项目给豆包换肤」「change my Doubao theme」时使用。
  只注入运行中的豆包界面，绝不修改官方安装目录或代码签名。
author: 飞书AI Builder 姜犇
---
# Doubao Skin

给豆包或豆包工作桌面端换肤。**一条命令搞定**：脚本会自动识别当前调用技能的客户端，只重启并注入该客户端。不碰官方安装文件，随时可还原。

前置：已安装豆包或豆包工作桌面端、Node.js 18+、macOS 或 Windows。

## 被调用时：先执行这套引导流程（Agent 必读）

**只要本技能被触发（用户说「换肤 / 换主题 / 换皮肤 / change my Doubao theme」等），就严格按下面 3 步顺序执行。目标只有一个：把 `apply.command` 跑起来，让后台自动完成换肤。任何一步失败都要立即停下，用一句话告诉用户卡在哪、怎么解决，不要跳过、不要臆测。** 这套流程把常见坑（缺 Node、用错入口、找不到安装目录）提前堵死，是本技能最稳的执行路径。

**❗最重要的一条：`apply.command` 返回后就结束本次任务，不要再运行任何后续命令（尤其别 `sleep`、别查 `status`、别读日志）。** 后台 worker 会自己重启客户端并注入皮肤；任何"等待/核验"命令都是多余的，只会让对话看起来"卡住"或最终抛一个无意义的报错。换肤成功与否，由用户切到客户端窗口肉眼确认即可。

**第 1 步 · 环境自检（全部通过才继续）**

1. 确认 Node：运行 `command -v node && node -v`。找不到或版本 < 18 → 停止并告知：「未检测到可用的 Node.js，请先安装 Node 18+ 后重试」。
2. 定位技能安装目录（得到 `DOUBAO_SKIN_ROOT`），用「换肤流程」里的定位脚本；定位不到 → 停止并告知：「未找到已安装的 doubao-skin，请确认技能已上传并通过安全检测」。

**第 2 步 · 执行换肤（入口必须是 `scripts/apply.command`）**

- 运行 `bash "$DOUBAO_SKIN_ROOT/scripts/apply.command"`（恢复上次皮肤）；用户指定了主题就加 `--theme <id>`（id 见「主题」小节）。
- ⚠️ 绝不要用 `node src/cli.mjs apply` 当入口——它只做注入、不会带调试端口重启客户端，会超时。
- 这条命令会派生后台 worker 并**立刻返回**，这就是成功启动的标志。**到此本次操作即完成，直接进入第 3 步回话，不要再执行任何命令。**

**第 3 步 · 收尾（只回话，不再执行命令）**

- 告诉用户：换肤已在后台启动，客户端会自动短暂重启，重启后右上角出现 🎨 按钮即为成功。
- 顺带说明：点 🎨 可切换全部主题 / 上传自定义图片 / 点「原生界面」还原；皮肤随界面存活，客户端完整重载后会消失，再说一次「换肤」即可恢复。
- 若用户反馈没生效，再排查（如是否只开了一个客户端、见下方说明），而不是主动去跑核验命令。

> **只开一个客户端**：普通豆包与豆包工作会互相抢占 `9333/9334` 端口。若两端同时运行且换肤异常，先关掉不换的那个再重试。

> **不要主动做核验**：历史上曾在这里加 `sleep` + `status` 的核验步骤，结果反而让对话卡住或抛出多余报错。现已移除——`apply.command` 返回即结束。确需人工排查日志时（仅限用户明确要求），等后台 worker 结束后再用 `perl -e 'alarm 3; exec @ARGV' tail -n 30 /tmp/doubao-skin-apply-work.log` 做带超时的一次性读取（macOS 无 `timeout` 命令，故用 perl 兜底；工作版 `-work`、普通版 `-personal`），**切勿用 `cat` / `tail -f` 跟随日志**——worker 持有其写句柄会导致命令行挂起。

下面的「换肤流程」「还原原生」「主题」等小节，是上述 3 步引用的具体命令与细节。

## 换肤流程

1. **先提示用户**：应用皮肤可能会自动重启当前客户端（约几秒），请先耐心等待。
2. **不要根据 R1 / R2 或 `.skills` / `.user_skills` 手拼单一安装路径，也不要直接使用一个未经验证的 system-reminder 路径。** 豆包使用 `.doubao`，豆包工作使用 `.doubaowork`。用户安装的 skill 通常位于 `.user_skills`，系统 skill 才位于 `.skills`。macOS 必须用下面这条命令先定位实际存在的目录，再执行脚本。务必用 `bash` 调用，不要用 `./`，因为 skill 被分发拷贝后可执行位会丢失：

   ```bash
   # macOS：兼容豆包/豆包工作以及用户 skill（R2）/系统 skill（R1）
   DOUBAO_SKIN_ROOT=""
   for candidate in \
     "$HOME/Library/Application Support/DoubaoWork"/*/.doubaowork/agent_mode/workspace/.user_skills/doubao-skin \
     "$HOME/Library/Application Support/Doubao"/*/.doubao/agent_mode/workspace/.user_skills/doubao-skin \
     "$HOME/Library/Application Support/DoubaoWork"/*/.doubaowork/agent_mode/workspace/.skills/doubao-skin \
     "$HOME/Library/Application Support/Doubao"/*/.doubao/agent_mode/workspace/.skills/doubao-skin
   do
     [ -f "$candidate/scripts/apply.command" ] && { DOUBAO_SKIN_ROOT="$candidate"; break; }
   done
   [ -n "$DOUBAO_SKIN_ROOT" ] || { echo "未找到已安装的 doubao-skin" >&2; exit 1; }

   # 恢复上次用过的皮肤（首次没有历史则用默认 jade-rabbit）
   bash "$DOUBAO_SKIN_ROOT/scripts/apply.command"
   # 指定主题时改为：
   # bash "$DOUBAO_SKIN_ROOT/scripts/apply.command" --theme chinese-dragon
   # 仅在终端直接调用且自动识别不符合预期时，才显式指定：
   # bash "$DOUBAO_SKIN_ROOT/scripts/apply.command" --client work
   ```

   ```powershell
   # Windows（PowerShell）
   .\scripts\apply.ps1
   .\scripts\apply.ps1 -Theme chinese-dragon
   # 终端直接调用时可显式指定：.\scripts\apply.ps1 -Client work
   ```
3. 命令返回后**不要再做别的**：当前客户端会在几秒内自动重启，重启后右上角出现 🎨 按钮即为成功。用户可切换主题、上传自定义图片、或点「原生界面」还原。

> **重启后默认加载哪张皮肤**：不带 `--theme` 时，恢复用户**上一次使用的皮肤**（内置 / 自定义均可；上次若选了「原生界面」则保持原生）。这个"上次选择"记在豆包 renderer 的 localStorage 里，跨重启不丢。只有显式 `--theme X` 才会覆盖它、强制用 X。所以常规换肤直接用不带参数的命令即可。

> **客户端如何识别**：优先读取 `--client` / `DOUBAO_CLIENT`，再检查调用进程祖先、技能安装目录（`.doubao` / `.doubaowork`）和唯一运行实例。识别结果会固定传给后台 worker。普通版使用 `9333 + doubao-chat`，工作版使用 `9334 + doubaowork-chat`，两端同时运行也不会串应用。

> **为什么关掉客户端后还能自动装回皮肤**：这个 skill 由客户端里的 agent 调用，一旦关闭客户端，发起命令的 agent 也会被终止。所以脚本先派生一个**脱离当前 session 的独立后台进程**（`perl fork+setsid`，PPID 归 1），由它延迟几秒后关闭已识别的客户端、带对应端口重启并注入。进度日志分别位于 `/tmp/doubao-skin-apply-personal.log` 和 `/tmp/doubao-skin-apply-work.log`。这些日志仅供事后人工排查，**Agent 不要 `cat` / `tail -f` 跟随它们**——后台 worker 持有其写句柄，跟随会导致命令行挂起。核验换肤是否成功一律用 `node src/cli.mjs status`。

## 还原原生

```bash
# macOS：先按“换肤流程”定位 DOUBAO_SKIN_ROOT
bash "$DOUBAO_SKIN_ROOT/scripts/pause.command"
.\scripts\pause.ps1          # Windows
```

## 主题

- 列出全部：`node src/cli.mjs list`
- 内置：`jade-rabbit`（默认）`mid-autumn-change` `lantern-moon` `god-of-wealth` `change-benyue` `monkey-king` `nezha` `chinese-dragon` `dunhuang-feitian` `nine-tailed-fox` `panda` `koi-fish` `hua-mulan`
- 用户说心情/角色（如「深色中国龙」）就映射到最接近的 id；拿不准就应用默认，让用户在 🎨 菜单里挑。

## 红线

- 绝不替换 / 编辑 / 接管 `Doubao.app`、`DoubaoWork.app` 或 Windows 安装目录，只注入运行中的界面。
- CDP 只绑定本机 `127.0.0.1`；皮肤生效期间别跑不可信的本地程序。
- 皮肤随客户端界面存活，界面完整重载后会消失，重跑上面那条命令即可恢复。
