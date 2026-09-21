// 豆包（Doubao 桌面端）皮肤 CSS 生成
// 基于实测：豆包 renderer 是 CEF/Chromium，html(documentElement) 上挂着完整的设计 token 体系
//   - 背景：--s-color-bg-body / --chatarea-bg-color / --dbx-bg-body-mac / --bg-base-1 / --dbx-bg-float
//   - 文字：--color-text-primary / --s-color-text-primary(-raw) / --s-color-text-secondary
//   - 品牌强调：--s-color-brand-primary-default-raw（RGB 三元组）/ --dbx-text-highlight / --s-color-accents-blue
//   - 深浅色原生开关：html[data-theme=light|dark]
// override 这些 token 即可全局换色；#root 作背景图层，稳定容器锚点透明让底图透出。
// 只用稳定锚点（#root / #chat-route-layout / #flow_chat_sidebar / [data-testid] / [data-container-name]），
// 不使用 CSS module 哈希类名（panel-fvxXfj 之类会随版本变动）。

const DEFAULT_COLORS = {
  accent: "#24c9d7",
  secondary: "#ef8fd3",
  surface: "#f7fbff",
  text: "#17344f",
};

function color(value, fallback) {
  const result = value ?? fallback;
  if (!/^#[0-9a-f]{3,8}$/i.test(result)) throw new Error(`无效主题颜色：${result}`);
  return result;
}

// 把 #rgb / #rrggbb(aa) 转成豆包 `-raw` 变量需要的 "r, g, b" 三元组（忽略 alpha）
function triplet(hex) {
  let h = hex.replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  else h = h.slice(0, 6);
  const n = Number.parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// 在 JS 侧把 hex 朝目标色混合（t=0 原色，t=1 目标色），用于 hover 的三元组
function mixTriplet(hex, target, t) {
  const a = triplet(hex).split(", ").map(Number);
  const b = target;
  return a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(", ");
}

function copy(value, fallback = "") {
  return JSON.stringify(typeof value === "string" ? value : fallback);
}

// 生成 rgba(r, g, b, a)（用于豆包那些直接写死 rgba 的文字 token，如 --semi-color-text-*）
function rgba(hex, alpha) {
  return `rgba(${triplet(hex)}, ${alpha})`;
}

function relativeLuminance(hex) {
  const channels = triplet(hex).split(", ").map((value) => {
    const channel = Number(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a, b) {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastText(background) {
  const dark = "#0f172a";
  const light = "#f8fafc";
  return contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light;
}

function hexFromChannels(channels) {
  return `#${channels.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function accessibleActionAccent(accent) {
  let channels = triplet(accent).split(", ").map(Number);
  let background = hexFromChannels(channels);
  let foreground = contrastText(background);
  const target = foreground === "#f8fafc" ? [0, 0, 0] : [255, 255, 255];
  for (let i = 0; i < 12 && contrastRatio(foreground, background) < 4.5; i += 1) {
    channels = channels.map((value, index) => value + (target[index] - value) * 0.12);
    background = hexFromChannels(channels);
    foreground = contrastText(background);
  }
  return { background, foreground };
}

export function buildSkinCss({ theme, heroDataUrl }) {
  if (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(heroDataUrl)) {
    throw new Error("hero 必须是本地 PNG、JPEG 或 WebP 数据");
  }
  const colors = {
    accent: color(theme.colors?.accent, DEFAULT_COLORS.accent),
    secondary: color(theme.colors?.secondary, DEFAULT_COLORS.secondary),
    surface: color(theme.colors?.surface, DEFAULT_COLORS.surface),
    text: color(theme.colors?.text, DEFAULT_COLORS.text),
  };
  const id = String(theme.id ?? "custom").replace(/[^a-z0-9_-]/gi, "");
  const accentRaw = triplet(colors.accent);
  const accentHoverRaw = mixTriplet(colors.accent, [0, 0, 0], 0.15);
  const surfaceRaw = triplet(colors.surface);
  const textRaw = triplet(colors.text);
  const actionAccent = accessibleActionAccent(colors.accent);

  return `/* DOUBAO_SKIN:${id} */
html {
  --db-accent: ${colors.accent};
  --db-secondary: ${colors.secondary};
  --db-surface: ${colors.surface};
  --db-text: ${colors.text};
  --db-action-accent: ${actionAccent.background};
  --db-on-accent: ${actionAccent.foreground};
  --db-image-scrim: color-mix(in srgb, var(--db-surface) 45%, transparent);

  /* 用户发送气泡：豆包用配套 token --g-send-msg-bubble-bg(#262626 深灰) + 
     --g-send-msg-bubble-text(#fff)。原生自洽，但换肤后若只改文字会造成深字深底/浅字浅底
     看不清。这里整对接管：气泡底用主题强调色磨砂，文字由 WCAG 对比度择黑/白 */
  --g-send-msg-bubble-bg: var(--db-action-accent) !important;
  --g-send-msg-bubble-bg-hover: color-mix(in srgb, var(--db-action-accent) 88%, #000 12%) !important;
  --g-send-msg-bubble-text: var(--db-on-accent) !important;
  --g-msg-bubble-bg: var(--g-send-msg-bubble-bg) !important;
  --g-msg-bubble-text: var(--g-send-msg-bubble-text) !important;

  /* 背景（主体 + 聊天区 + 浮层 + base 层） */
  --s-color-bg-body: var(--db-surface) !important;
  --s-color-bg-body-raw: ${surfaceRaw} !important;
  --chatarea-bg-color: color-mix(in srgb, var(--db-surface) 92%, transparent) !important;
  --dbx-bg-body-mac: color-mix(in srgb, var(--db-surface) 93%, transparent) !important;
  --dbx-bg-body-launcher: color-mix(in srgb, var(--db-surface) 90%, transparent) !important;
  --bg-base-1: var(--db-surface) !important;
  --bg-base-1-overlay: color-mix(in srgb, var(--db-surface) 96%, transparent) !important;
  --bg-base-4-overlay: color-mix(in srgb, var(--db-surface) 92%, transparent) !important;
  --dbx-bg-float: color-mix(in srgb, var(--db-surface) 96%, transparent) !important;
  --s-color-bg-intact-primary: var(--db-surface) !important;
  --s-color-bg-intact-secondary: color-mix(in srgb, var(--db-surface) 94%, transparent) !important;
  --s-color-bg-intact-tertiary: color-mix(in srgb, var(--db-surface) 88%, transparent) !important;
  --s-color-bg-dialogs-raw: ${surfaceRaw} !important;

  /* 文字 */
  --color-text-primary: var(--db-text) !important;
  --s-color-text-primary: var(--db-text) !important;
  --s-color-text-primary-raw: ${textRaw} !important;
  --s-color-text-secondary: ${rgba(colors.text, 0.85)} !important;
  --s-color-text-intact-secondary: ${rgba(colors.text, 0.85)} !important;
  --color-text-tertiary: ${rgba(colors.text, 0.45)} !important;
  --s-color-text-tertiary: ${rgba(colors.text, 0.5)} !important;
  --s-color-text-intact-tertiary: ${rgba(colors.text, 0.5)} !important;
  --s-color-text-quaternary: ${rgba(colors.text, 0.3)} !important;
  --color-dbx-text-secondary: ${rgba(colors.text, 0.55)} !important;
  --dbx-text-tertiary: ${rgba(colors.text, 0.4)} !important;

  /* 聊天正文（豆包的 markdown 消息体用 md-box-samantha-* 上色，默认写死黑色，
     深色皮肤下会看不清 —— 这里统一跟随 --db-text） */
  --md-box-samantha-normal-text-color: ${rgba(colors.text, 0.92)} !important;
  --md-box-samantha-h1-color: var(--db-text) !important;
  --md-box-samantha-h2-color: var(--db-text) !important;
  --md-box-samantha-h3-color: var(--db-text) !important;
  --md-box-samantha-li-maker-color: ${rgba(colors.text, 0.55)} !important;
  --chat-kit-samantha-normal-text-color: ${rgba(colors.text, 0.92)} !important;

  /* Semi 组件文字 ramp（默认 rgba(28,31,35,*)，同样写死不随深浅色变） */
  --semi-color-text-0: var(--db-text) !important;
  --semi-color-text-1: ${rgba(colors.text, 0.8)} !important;
  --semi-color-text-2: ${rgba(colors.text, 0.6)} !important;
  --semi-color-text-3: ${rgba(colors.text, 0.35)} !important;

  /* neutral-1000 黑色系 ramp（大量图标/次级文字取自它，深色皮肤下需翻白） */
  --dbx-neutral-1000: var(--db-text) !important;
  --dbx-neutral-1000-95: ${rgba(colors.text, 0.95)} !important;
  --dbx-neutral-1000-90: ${rgba(colors.text, 0.9)} !important;
  --dbx-neutral-1000-85: ${rgba(colors.text, 0.85)} !important;
  --dbx-neutral-1000-80: ${rgba(colors.text, 0.8)} !important;
  --dbx-neutral-1000-75: ${rgba(colors.text, 0.75)} !important;
  --dbx-neutral-1000-70: ${rgba(colors.text, 0.7)} !important;
  --dbx-neutral-1000-45: ${rgba(colors.text, 0.45)} !important;
  --dbx-neutral-1000-40: ${rgba(colors.text, 0.4)} !important;
  --dbx-neutral-1000-35: ${rgba(colors.text, 0.35)} !important;
  --dbx-neutral-1000-25: ${rgba(colors.text, 0.25)} !important;

  /* neutral 灰阶 ramp（200=#333…900=#e5e5e5，为浅色模式设计的固定灰阶，
     深色皮肤下 text-dbx-neutral-400 之类的次级文字/描边会变成深灰看不清）。
     低 index 多用于文字→高不透明度，高 index 多用于描边/底→低不透明度 */
  --dbx-neutral-200: ${rgba(colors.text, 0.92)} !important;
  --dbx-neutral-300: ${rgba(colors.text, 0.82)} !important;
  --dbx-neutral-400: ${rgba(colors.text, 0.7)} !important;
  --dbx-neutral-500: ${rgba(colors.text, 0.6)} !important;
  --dbx-neutral-600: ${rgba(colors.text, 0.5)} !important;
  --dbx-neutral-700: ${rgba(colors.text, 0.38)} !important;
  --dbx-neutral-800: ${rgba(colors.text, 0.26)} !important;
  --dbx-neutral-900: ${rgba(colors.text, 0.16)} !important;

  /* 品牌 / 强调色（链接、高亮、选中态） */
  --s-color-brand-primary-default-raw: ${accentRaw} !important;
  --s-color-brand-primary-hover-raw: ${accentHoverRaw} !important;
  --s-color-accents-blue: var(--db-accent) !important;
  --dbx-text-highlight: var(--db-accent) !important;
  --dbx-text-highlight-hover: color-mix(in srgb, var(--db-accent) 80%, #ffffff) !important;
  --dbx-code-link: var(--db-accent) !important;
  --color-link-text-active: var(--db-accent) !important;
  --semi-color-link-hover: var(--db-accent) !important;
  --dbx-fill-primary-transparent-1: color-mix(in srgb, var(--db-accent) 9%, transparent) !important;
  --primary-transparent-2: color-mix(in srgb, var(--db-accent) 16%, transparent) !important;

  /* 主操作按钮（发送 / 复制等，原生是深色块，跟随强调色） */
  --dbx-bg-base-4-action: var(--db-action-accent) !important;
  --g-send-msg-btn-bg: var(--db-action-accent) !important;
  --g-send-msg-btn-hover-bg: color-mix(in srgb, var(--db-action-accent) 85%, #000000) !important;
  --g-send-msg-btn-active-bg: color-mix(in srgb, var(--db-action-accent) 78%, #000000) !important;
}

/* 背景图铺在 #root，稳定容器透明让底图大面积透出 */
#root {
  color: var(--db-text) !important;
  background:
    linear-gradient(var(--db-image-scrim), var(--db-image-scrim)),
    linear-gradient(90deg, color-mix(in srgb, var(--db-surface) 92%, transparent) 0 20%, transparent 46%),
    linear-gradient(180deg, transparent 0 45%, color-mix(in srgb, var(--db-surface) 52%, transparent) 82% 100%),
    url(${JSON.stringify(heroDataUrl)}) right center / cover no-repeat fixed !important;
}

/* 布局根、主区、聊天 main 透明，露出 #root 背景图 */
#chat-route-layout,
#chat-route-main,
main[data-container-name=main],
main {
  background: transparent !important;
}

/* 左侧导航 / 会话侧栏：磨砂玻璃 */
[data-testid=chat_route_layout_leftside_nav],
#flow_chat_sidebar {
  background: color-mix(in srgb, var(--db-surface) 92%, transparent) !important;
  border-right: 1px solid color-mix(in srgb, var(--db-accent) 40%, transparent) !important;
  backdrop-filter: blur(20px) saturate(1.12);
}

/* ── 顶部标题栏（header）──
   豆包新版把聊天页顶部做成一条独立 header：容器带 h-header-height，背景走
   --chat-bg-color(写死 #fff)，底部 border-b 走 --dbx-line-7(rgba(0,0,0,.07) 黑线)。
   换肤后这条白底黑线会浮在壁纸上、割裂通透感。这里把它整条透明化，让壁纸透上来；
   用可读的稳定 tailwind 类 h-header-height 作锚点(不用哈希类)，两端(豆包/豆包工作)通用。 */
div[class*=h-header-height] {
  --chat-bg-color: transparent !important;
  --dbx-line-7: transparent !important;
  background: transparent !important;
  border-bottom-color: transparent !important;
}

/* 顶栏右上角工具按钮（显示/收起侧栏 / 在启动器打开 / 对话摘要 / 打开侧边工作台 等）：
   图标 color/fill 写死 rgb(0,0,0) 纯黑，不随 data-theme 变，深色皮肤下看不清、
   浅色壁纸上也突兀。用稳定的 testid + aria-label 锚点接到主题文字色(currentColor)。
   注意：侧栏按钮两端 testid 不同(豆包工作=siderbar_closed_status_btn，豆包=siderbar_close_btn)，
   用 [data-testid^=siderbar] 前缀一并覆盖。「自动播报」已有独立规则，此处不重复。 */
div[class*=h-header-height] button[data-testid^=siderbar],
div[class*=h-header-height] button[data-testid=open-in-launcher-btn],
div[class*=h-header-height] button[aria-label="对话摘要"],
div[class*=h-header-height] button[aria-label="打开侧边工作台"] {
  color: color-mix(in srgb, var(--db-text) 88%, transparent) !important;
}
div[class*=h-header-height] button[data-testid^=siderbar] svg,
div[class*=h-header-height] button[data-testid=open-in-launcher-btn] svg,
div[class*=h-header-height] button[aria-label="对话摘要"] svg,
div[class*=h-header-height] button[aria-label="打开侧边工作台"] svg,
div[class*=h-header-height] button[data-testid^=siderbar] svg *,
div[class*=h-header-height] button[data-testid=open-in-launcher-btn] svg *,
div[class*=h-header-height] button[aria-label="对话摘要"] svg *,
div[class*=h-header-height] button[aria-label="打开侧边工作台"] svg * {
  color: inherit !important;
  fill: currentColor !important;
}
/* hover：主题强调色低透明底，保持可点击反馈 */
div[class*=h-header-height] button[data-testid^=siderbar]:hover,
div[class*=h-header-height] button[data-testid=open-in-launcher-btn]:hover,
div[class*=h-header-height] button[aria-label="对话摘要"]:hover,
div[class*=h-header-height] button[aria-label="打开侧边工作台"]:hover {
  background: color-mix(in srgb, var(--db-accent) 18%, transparent) !important;
}

/* 右侧详情面板半透明磨砂 */
[data-testid=samantha_layout_right_side] {
  background: color-mix(in srgb, var(--db-surface) 86%, transparent) !important;
  backdrop-filter: blur(18px) saturate(1.08);
}
/* 右侧工作台「新标签页」的搜索框和快捷操作卡片都取 --s-color-bg-float。
   豆包在 body 上把该变量重置为 #fff，需在稳定的工作台容器内重新接回主题浮层色。 */
[data-testid=right-panel-container] {
  --s-color-bg-float: color-mix(in srgb, var(--db-surface) 96%, transparent) !important;
}

/* 会话列表项透明，选中/悬停跟随强调色 */
[data-testid=chat_list_thread_item] {
  background: transparent !important;
}

/* 左侧历史对话标题：豆包写死了 rgba(0,0,0,.85) 黑字，深色皮肤下看不清，改跟随主题文字色 */
[data-testid=chat_list_item_title] {
  color: var(--db-text) !important;
}
/* 会话分组标题是独立 token text-dbx-text-tertiary，且 sticky 底色不继承侧栏磨砂层 */
[data-testid=sidebar-section-item] {
  background: color-mix(in srgb, var(--db-surface) 96%, transparent) !important;
  color: var(--db-text) !important;
}
[data-testid=view_all_chats_button] {
  color: color-mix(in srgb, var(--db-text) 72%, transparent) !important;
}

/* 头部自动播报：组件局部把 --s-color-text-secondary 重置成黑色，深色皮肤下扬声器不可见。
   aria-label 会在「开启自动播报 / 关闭自动播报」间切换，可作为稳定状态锚点。 */
button[aria-label*="自动播报"] {
  color: color-mix(in srgb, var(--db-text) 88%, transparent) !important;
  background: color-mix(in srgb, var(--db-surface) 82%, transparent) !important;
  border: 1px solid color-mix(in srgb, var(--db-text) 16%, transparent) !important;
}
button[aria-label*="自动播报"] *,
button[aria-label*="自动播报"] svg,
button[aria-label*="自动播报"] path {
  color: inherit !important;
  fill: currentColor !important;
}
button[aria-label*="自动播报"]:hover {
  color: var(--db-text) !important;
  background: color-mix(in srgb, var(--db-accent) 18%, var(--db-surface)) !important;
}
button[aria-label*="自动播报"]:focus-visible {
  outline: 2px solid var(--db-accent) !important;
  outline-offset: 2px;
}
/* aria-label=关闭… 表示当前已开启：使用主操作色明确表达 active 状态。 */
button[aria-label^="关闭"][aria-label*="自动播报"] {
  color: var(--db-on-accent) !important;
  background: var(--db-action-accent) !important;
  border-color: transparent !important;
}
button[aria-label^="关闭"][aria-label*="自动播报"]:hover {
  color: var(--db-on-accent) !important;
  background: color-mix(in srgb, var(--db-action-accent) 86%, #000000) !important;
}

/* 对话正文：豆包的 AI 回答用 [data-testid=message_text_content] 承载。正文中的
   「知识库 / 文档」来源标签会读取 body 上被重置为黑色的 tertiary / trans token，
   因此先在消息作用域接回主题色，再兜底处理写死的正文颜色。 */
[data-testid=message_text_content] {
  --s-color-text-tertiary: color-mix(in srgb, var(--db-text) 58%, transparent) !important;
  --s-color-bg-trans: color-mix(in srgb, var(--db-text) 9%, transparent) !important;
}
[data-testid=message_text_content],
[data-testid=message_text_content] * {
  color: var(--db-text) !important;
}
/* 但「用户发送气泡」有自己的配套底色/文字（.bg-g-send-msg-bubble-bg + text token），
   上面的规则会误伤气泡文字→与气泡底撞色。这里恢复为 WCAG 择黑/白的气泡专用色 */
[class*=send-msg-bubble] [data-testid=message_text_content],
[class*=send-msg-bubble] [data-testid=message_text_content] *,
[class*=bg-g-send-msg-bubble-bg],
[class*=bg-g-send-msg-bubble-bg] * {
  color: var(--g-send-msg-bubble-text, var(--db-on-accent)) !important;
}
/* 文件拖放浮层文案同样写死黑字 */
[data-testid=file_drop_area],
[data-testid=file_drop_area] * {
  color: var(--db-text) !important;
}

/* AI 的思维链/推理过程(COT)：在 markdown 渲染盒 md-box-root 内，但不在
   message_text_content 作用域中，颜色写死 rgba(0,0,0,.5)（半透明黑，COT 属次级内容），
   不走任何主题 token，深色皮肤下整段黑字看不清。用稳定的 md-box-root 作锚点，
   把其内正文接到主题文字色(略降透明度以保留"次级内容"的视觉层级)。 */
[class*=md-box-root],
[class*=md-box-root] * {
  color: color-mix(in srgb, var(--db-text) 82%, transparent) !important;
}
/* md-box-root 也可能出现在用户发送气泡里(气泡有自己的 accent 底/配套文字)，
   这里把气泡内的 md-box 文字恢复为气泡专用色，避免上面规则误伤(放在其后覆盖)。 */
[class*=send-msg-bubble] [class*=md-box-root],
[class*=send-msg-bubble] [class*=md-box-root] *,
[class*=bg-g-send-msg-bubble-bg] [class*=md-box-root],
[class*=bg-g-send-msg-bubble-bg] [class*=md-box-root] * {
  color: var(--g-send-msg-bubble-text, var(--db-on-accent)) !important;
}

/* 思维链盒子(thinking-box-root)：COT 的折叠标题「已读取…技能」「已执行代码」
   「已完成」等文字写死 rgba(0,0,0,.5) 黑，深色皮肤下看不清。
   注意：豆包在盒内某些容器上「局部重定义」了 --s-color-text-tertiary 为黑色
   (Tailwind 的 [&_[data-thinking-box=...]]:text-s-color-text-tertiary)，会盖过 html
   上的全局接管。所以这里在盒内作用域再压一次这些变量，并对 data-thinking-box 元素
   用属性选择器(特异性更高)直接兜底文字色。 */
[class*=thinking-box-root],
[class*=thinking-box-root] * {
  --s-color-text-tertiary: color-mix(in srgb, var(--db-text) 50%, transparent) !important;
  --s-color-text-quaternary: color-mix(in srgb, var(--db-text) 35%, transparent) !important;
  --color-text-tertiary: color-mix(in srgb, var(--db-text) 45%, transparent) !important;
  color: color-mix(in srgb, var(--db-text) 82%, transparent) !important;
}
[class*=thinking-box-root] [data-thinking-box],
[class*=thinking-box-root] [data-thinking-box] * {
  color: color-mix(in srgb, var(--db-text) 82%, transparent) !important;
}
/* 思维链里的代码块用 CodeMirror(.cm-editor，外层 cm-theme dark 已把代码文字设为亮白)，
   但其背景与外层圆角盒被置成浅色 rgb(249,250,251) → 白底白字。代码块按惯例统一为
   深底亮字：给编辑器、gutter 及外层白盒铺独立深色面板底，文字/行号用亮色。
   外层白盒自带 Tailwind 的 bg-s-color-bg-secondary! (important)，用 :has(>.cm-theme)
   精准命中那个包裹盒把它也压深，否则深色编辑器外会残留一圈白边框。 */
[class*=thinking-box-root] .cm-editor,
[class*=thinking-box-root] .cm-gutters,
[class*=thinking-box-root] .cm-theme,
[class*=thinking-box-root] .cm-theme > div,
[class*=thinking-box-root] div:has(> .cm-theme) {
  background: #1a1a1a !important;
}
[class*=thinking-box-root] .cm-content,
[class*=thinking-box-root] .cm-line,
[class*=thinking-box-root] .cm-activeLine {
  color: rgba(248, 250, 252, 0.92) !important;
}
[class*=thinking-box-root] .cm-gutters,
[class*=thinking-box-root] .cm-lineNumbers,
[class*=thinking-box-root] .cm-lineNumbers .cm-gutterElement {
  color: rgba(248, 250, 252, 0.4) !important;
}

/* 对话内表格的工具条表头（.table-header-*「表格」标签+图标）写死浅灰底 rgb(243,244,246)，
   深色皮肤下露白且图标看不清，改成主题磨砂底 + 主题文字色 */
[class*=table-header-] {
  background: color-mix(in srgb, var(--db-surface) 80%, transparent) !important;
  color: var(--db-text) !important;
}

/* HTML 图表右上角悬浮工具栏：原生白底搭配部分浅色图标，深色主题下除「查看代码」
   外几乎不可见。工具栏、图表操作按钮和 Semi Tab 分别接管，保留明确选中态。 */
[data-testid=message_text_content] [class*=tabbar-] {
  background: color-mix(in srgb, var(--db-surface) 94%, transparent) !important;
  border-color: color-mix(in srgb, var(--db-text) 14%, transparent) !important;
  color: var(--db-text) !important;
  backdrop-filter: blur(14px) saturate(1.06);
}
[data-testid=message_text_content] [class*=tabbar-] [data-testid^=diagram-],
[data-testid=message_text_content] [class*=tabbar-] [role=tab] {
  color: color-mix(in srgb, var(--db-text) 82%, transparent) !important;
}
[data-testid=message_text_content] [class*=tabbar-] [role=tab][aria-selected=true] {
  color: var(--db-text) !important;
  background: color-mix(in srgb, var(--db-accent) 20%, transparent) !important;
}
[data-testid=message_text_content] [class*=tabbar-] svg,
[data-testid=message_text_content] [class*=tabbar-] svg * {
  fill: currentColor !important;
}
[data-testid=message_text_content] [class*=tabbar-] [class*=divider-] {
  background: color-mix(in srgb, var(--db-text) 16%, transparent) !important;
}

/* 新任务欢迎页的问候语「有什么我能帮你的吗？」用 ::after 做打字机遮罩，
   遮罩底色写死成 #fcfcfc（原生白底下隐形）；换肤后会露成一条白色长条，置空即可 */
#flow-chat-guidance-page [class*=greeting-text-]::after,
[class*=greeting-text-]::after {
  background: transparent !important;
}

/* 技能页等长列表顶部的「滚动渐隐遮罩」(scrollTopMask-*)：豆包用 body 背景色做
   自上而下的渐隐条，原生浅色下是白色渐隐、隐形；换肤后 body 变主题深色，就在壁纸
   顶部露成一条突兀的黑/深色渐变带。壁纸皮肤本就通透、不需要这条渐隐提示，置透明即可。
   类名带版本哈希后缀，用可读前缀 [class*=scrollTopMask-] 匹配。 */
[class*=scrollTopMask-] {
  background: transparent !important;
}

/* 底部输入框（composer）：豆包这里写死了白底 #fff，深色皮肤下会白底白字看不清，
   直接给稳定锚点 #input-engine-container / [data-testid=chat_input] 铺主题底色 */
#input-engine-container,
#input-engine-container > div,
[data-testid=chat_input] {
  background: color-mix(in srgb, var(--db-surface) 94%, transparent) !important;
  color: var(--db-text) !important;
}
#input-engine-container {
  border: 1px solid color-mix(in srgb, var(--db-accent) 28%, transparent) !important;
  backdrop-filter: blur(18px) saturate(1.08);
}
/* 输入框正文与占位符跟随主题文字色 */
[data-testid=chat_input_input],
[data-testid=chat_input_input] * {
  color: var(--db-text) !important;
}
[data-testid=chat_input_input] ::placeholder,
[data-testid=chat_input_input][data-placeholder]::before {
  color: ${rgba(colors.text, 0.5)} !important;
}
/* 输入框底部模式/技能工具栏。自定义主题过去会残留哨兵派生色，显式语义化作为兜底。 */
[data-testid=chat_input] button:not([data-testid*=send]),
[data-testid=chat_input] button:not([data-testid*=send]) * {
  color: color-mix(in srgb, var(--db-text) 86%, transparent) !important;
}

/* ── 图片预览 / 编辑器 ──
   预览画布原生固定为 #1a1a1a 深色工作区，但顶部工具条仍会继承聊天页的浅色模式黑字，
   换肤后形成深底黑图标。预览器应是独立语义域，不跟随聊天 surface 的明暗。 */
[data-testid=image_editor_panel] {
  --db-preview-surface: #1a1a1a;
  --db-preview-surface-raised: #242424;
  --db-preview-text: #f8fafc;
  --db-preview-text-muted: rgba(248, 250, 252, 0.68);
  --db-preview-control-hover: rgba(248, 250, 252, 0.1);
  --color-text-primary: var(--db-preview-text) !important;
  --s-color-text-primary: var(--db-preview-text) !important;
  --s-color-text-secondary: rgba(248, 250, 252, 0.82) !important;
  --color-dbx-text-secondary: var(--db-preview-text-muted) !important;
  --dbx-text-tertiary: rgba(248, 250, 252, 0.52) !important;
  --semi-color-text-0: var(--db-preview-text) !important;
  --semi-color-text-1: rgba(248, 250, 252, 0.82) !important;
  --semi-color-text-2: var(--db-preview-text-muted) !important;
  --semi-color-text-3: rgba(248, 250, 252, 0.46) !important;
  --dbx-neutral-1000: var(--db-preview-text) !important;
  --dbx-neutral-1000-85: rgba(248, 250, 252, 0.85) !important;
  --dbx-neutral-1000-70: rgba(248, 250, 252, 0.7) !important;
  --dbx-neutral-1000-45: rgba(248, 250, 252, 0.45) !important;
  --dbx-bg-base-5: var(--db-preview-surface) !important;
  --color-dbx-bg-base-5: var(--db-preview-surface) !important;
  --dbx-bg-float: var(--db-preview-surface-raised) !important;
  --dbx-fill-trans-20-hover: var(--db-preview-control-hover) !important;
  background: var(--db-preview-surface) !important;
  color: var(--db-preview-text) !important;
  color-scheme: dark;
}
/* 顶栏有独立内联背景 var(--color-dbx-bg-base-5)；使用稳定 onboarding 锚点双保险。 */
[data-testid=image_editor_panel] > [data-onboarding-id=header_control_bar],
[data-testid=image_editor_panel] [data-onboarding-id=header_control_bar] {
  background: var(--db-preview-surface) !important;
  color: var(--db-preview-text) !important;
  border-bottom-color: rgba(248, 250, 252, 0.12) !important;
}
/* 顶栏、缩放、工具项、更多与关闭按钮：图标均用 currentColor，统一接到预览文字色。 */
[data-testid=image_editor_panel] [data-testid=control_bar_action_list],
[data-testid=image_editor_panel] [data-testid=control_bar_action_list] *,
[data-testid=image_editor_panel] [data-testid=edit_image_more_actions_button],
[data-testid=image_editor_panel] [data-testid=edit_image_more_actions_button] *,
[data-testid=image_editor_panel] [data-testid=canvas_close_btn],
[data-testid=image_editor_panel] [data-testid=canvas_close_btn] * {
  color: var(--db-preview-text) !important;
}
[data-testid=image_editor_panel] [data-testid=control_bar_action_list] svg,
[data-testid=image_editor_panel] [data-testid=edit_image_more_actions_button] svg,
[data-testid=image_editor_panel] [data-testid=canvas_close_btn] svg {
  fill: currentColor !important;
}
/* 交互表面：覆盖 div 伪按钮和真实 button。 */
[data-testid=image_editor_panel] [data-testid^=edit_image_][data-testid$=_button_inside],
[data-testid=image_editor_panel] [data-testid=edit_image_video],
[data-testid=image_editor_panel] [data-testid=edit_image_more_actions_button],
[data-testid=image_editor_panel] [data-testid=canvas_close_btn],
[data-testid=image_editor_panel] [data-testid=control_bar_action_list] [class*=btn-wrapper-] {
  border-radius: 8px;
}
[data-testid=image_editor_panel] [data-testid^=edit_image_][data-testid$=_button_inside]:hover,
[data-testid=image_editor_panel] [data-testid=edit_image_video]:hover,
[data-testid=image_editor_panel] [data-testid=edit_image_more_actions_button]:hover,
[data-testid=image_editor_panel] [data-testid=canvas_close_btn]:hover,
[data-testid=image_editor_panel] [data-testid=control_bar_action_list] [class*=btn-wrapper-]:hover {
  background: var(--db-preview-control-hover) !important;
}
/* 当前工具选中态：主题强调色 + 低透明底，和普通工具有明确区分。 */
[data-testid=image_editor_panel] [data-testid=control_bar_action_list] [class*=selected-],
[data-testid=image_editor_panel] [data-testid=control_bar_action_list] [aria-pressed=true],
[data-testid=image_editor_panel] [data-testid=control_bar_action_list] [data-state=active] {
  background: color-mix(in srgb, var(--db-accent) 22%, transparent) !important;
  color: color-mix(in srgb, var(--db-accent) 72%, #ffffff) !important;
}
[data-testid=image_editor_panel] [data-testid=control_bar_action_list] [class*=selected-] *,
[data-testid=image_editor_panel] [data-testid=control_bar_action_list] [aria-pressed=true] *,
[data-testid=image_editor_panel] [data-testid=control_bar_action_list] [data-state=active] * {
  color: inherit !important;
}
/* disabled 保持可辨认，但弱化层级。 */
[data-testid=image_editor_panel] :disabled,
[data-testid=image_editor_panel] [aria-disabled=true],
[data-testid=image_editor_panel] [class*=disabled-] {
  color: var(--db-preview-text-muted) !important;
  opacity: 0.58 !important;
}
/* 保存是主操作，必须使用成对的 accent / on-accent，而不是固定白字。 */
[data-testid=image_editor_panel] [data-testid=edit_image_download_button],
[data-testid=image_editor_panel] [data-testid=edit_image_download_button] * {
  color: var(--db-on-accent) !important;
}
[data-testid=image_editor_panel] [data-testid=edit_image_download_button] {
  background: var(--db-action-accent) !important;
}
[data-testid=image_editor_panel] [data-testid=edit_image_download_button]:hover {
  background: color-mix(in srgb, var(--db-action-accent) 86%, #000000) !important;
}
/* 缩略图：取消写死浅灰底，并用主题强调色标记当前图片。 */
[data-testid=image_editor_panel] [class*=thumb-image-] {
  background: var(--db-preview-surface-raised) !important;
}
[data-testid=image_editor_panel] [class*=active-] [class*=thumb-image-],
[data-testid=image_editor_panel] [class*=thumb-image-][class*=active-] {
  outline: 2px solid var(--db-accent) !important;
  outline-offset: 2px;
}

/* ── 产物详情页顶栏的「在浏览器打开 / 关闭」按钮 ──
   产物(如网页/应用产物)详情页顶栏的 canvas_open_in_browser_btn / canvas_close_btn
   以及工具条 control_bar_action_list，豆包给它们带了 color-black-* 变体，图标 currentColor
   写死 rgba(0,0,0,.85) 黑色，不随 data-theme 变。深色皮肤下就是深底黑图标看不清。
   这里全局兜底接到主题文字色；图片编辑器里的同名 testid 有更具体的作用域规则
   ([data-testid=image_editor_panel] ...)，特异性更高，会自然覆盖本规则、不受影响。 */
[data-testid=canvas_open_in_browser_btn],
[data-testid=canvas_open_in_browser_btn] *,
[data-testid=canvas_close_btn],
[data-testid=canvas_close_btn] *,
[data-testid=control_bar_action_list],
[data-testid=control_bar_action_list] * {
  color: color-mix(in srgb, var(--db-text) 88%, transparent) !important;
}
[data-testid=canvas_open_in_browser_btn] svg,
[data-testid=canvas_close_btn] svg,
[data-testid=control_bar_action_list] svg {
  fill: currentColor !important;
}

/* ── 弹层/浮层深色适配 ──
   系统性排查发现：豆包大量按需挂载的浮层（弹窗、气泡、卡片、Toast、代码块加载态、
   画板菜单等）背景写死成 #fff / #f5f5f5 等浅色，不随 data-theme 变。这些元素用 CSS
   module 哈希类名（如 .modal-dPgc_i），但「可读前缀」在同一版本内稳定，用
   [class*=前缀-] 前缀匹配。全部铺主题磨砂底 + 主题文字，随主题深浅自动适配。
   注意：输入框的 / 呼出面板前缀会随豆包版本变（曾是 popoverWrapper-，更新后成 panel-），
   两者都保留兜底；panel- 太宽泛会误伤左侧导航(也叫 panel-*)，故限定在
   [data-testid=chat_input] / #input-engine-container 作用域内。 */
[class*=popover-content-],
[class*=popoverWrapper-],
[class*=modal-content-],
[class*=modal-body-],
[class*=card_container_],
[class*=canvas-menu-box-],
[class*=menu-list-],
[class*=dropdown-],
[data-testid=chat_input] [class*=panel-],
#input-engine-container [class*=panel-],
.semi-dropdown-menu,
.semi-popover-content,
.semi-select-option-list,
.semi-tooltip-content {
  background: color-mix(in srgb, var(--db-surface) 92%, transparent) !important;
  color: var(--db-text) !important;
  backdrop-filter: blur(16px) saturate(1.06);
}
/* Toast / 通知：写死白/米底 */
.semi-toast-content,
[class*=push-toast-] .semi-toast-content {
  background: color-mix(in srgb, var(--db-surface) 94%, transparent) !important;
  color: var(--db-text) !important;
}
/* 代码块「生成中」占位底、思维导图导出卡底等写死浅色的块 */
[class*=code-block-element-] [class*=generating-],
[class*=mindmapExportCard-] [class*=footer-] {
  background: color-mix(in srgb, var(--db-surface) 90%, transparent) !important;
  color: var(--db-text) !important;
}
/* 弹层内的下拉/选项/菜单项文字统一跟随主题色，避免深底黑字 */
[class*=popover-content-] *,
[class*=popoverWrapper-] *,
[class*=modal-content-] *,
[class*=card_container_] *,
[data-testid=chat_input] [class*=panel-] *,
#input-engine-container [class*=panel-] *,
.semi-dropdown-menu *,
.semi-select-option-list * {
  color: var(--db-text) !important;
}

/* ── 输入框 + / @ 呼出的「建议」面板 ──
   新版用稳定属性 data-input-engine-suggestion-panel 标记 area- 根节点，旧版则在
   suggestionHost-* 下渲染 area- / groupLabel- / item-*。内部铺满的 area- 层背景走
   --input-engine-suggestion-area-background → --input-guidance-input-container-background
   → --dbx-bg-float → #fff 的 fallback 链，前两个变量原生未定义，最终落到写死 #fff，
   加上文字已翻成浅色，就会出现白底浅字。直接在稳定属性节点上接管变量与背景；
   旧版保留 suggestionHost-* 兜底。sticky 分组标题需使用同色实底，避免滚动时透字。 */
[data-input-engine-suggestion-panel=true],
[class*=suggestionHost-] {
  --input-engine-suggestion-area-background: color-mix(in srgb, var(--db-surface) 96%, transparent) !important;
  --input-guidance-input-container-background: color-mix(in srgb, var(--db-surface) 96%, transparent) !important;
  background: color-mix(in srgb, var(--db-surface) 96%, transparent) !important;
  color: var(--db-text) !important;
}
[data-input-engine-suggestion-panel=true] [data-suggestion-group-label=true] {
  background: color-mix(in srgb, var(--db-surface) 96%, transparent) !important;
  color: color-mix(in srgb, var(--db-text) 56%, transparent) !important;
}
[class*=suggestionHost-] [class*=area-],
[class*=suggestionHost-] [class*=groupLabel-] {
  background: transparent !important;
}
[data-input-engine-suggestion-panel=true] [role=option],
[data-input-engine-suggestion-panel=true] [role=option] *,
[class*=suggestionHost-] [class*=item-],
[class*=suggestionHost-] [class*=groupLabel-],
[class*=suggestionHost-] [class*=standardItem-],
[class*=suggestionHost-] [class*=standardLabel-],
[class*=suggestionHost-] [class*=standardDescription-] {
  color: var(--db-text) !important;
}

/* brand 文案（copy 为空时不显示） */
#root::before {
  position: fixed;
  z-index: 20;
  top: 72px;
  left: max(260px, 22vw);
  content: ${copy(theme.copy?.brand)};
  color: var(--db-accent);
  font: 800 clamp(16px, 2vw, 30px)/1.2 ui-rounded, system-ui;
  text-shadow: 0 2px 10px color-mix(in srgb, var(--db-surface) 90%, transparent);
  pointer-events: none;
}

/* headline 文案 */
#root::after {
  position: fixed;
  z-index: 20;
  top: 116px;
  left: max(260px, 22vw);
  max-width: 42vw;
  content: ${copy(theme.copy?.headline)};
  color: var(--db-text);
  font: 750 clamp(18px, 2.7vw, 42px)/1.15 ui-rounded, system-ui;
  text-shadow: 0 2px 12px color-mix(in srgb, var(--db-surface) 90%, transparent);
  pointer-events: none;
}
`;
}
