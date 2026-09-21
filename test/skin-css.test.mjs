import assert from "node:assert/strict";
import test from "node:test";

import { buildSkinCss } from "../src/skin-css.mjs";

const HERO = "data:image/png;base64,AA==";

function cssFor(colors) {
  return buildSkinCss({
    theme: { id: "test", name: "test", colors, copy: null },
    heroDataUrl: HERO,
  });
}

test("chooses readable on-accent text for light and dark accents", () => {
  const light = cssFor({
    accent: "#F5D547",
    secondary: "#999999",
    surface: "#FAFAFA",
    text: "#0F172A",
  });
  const dark = cssFor({
    accent: "#54265E",
    secondary: "#999999",
    surface: "#15111A",
    text: "#F8FAFC",
  });

  assert.match(light, /--db-on-accent: #0f172a;/);
  assert.match(dark, /--db-on-accent: #f8fafc;/);
});

test("protects text-bearing surfaces from arbitrary background images", () => {
  const css = cssFor({
    accent: "#797493",
    secondary: "#756479",
    surface: "#13141F",
    text: "#F8FAFC",
  });

  assert.match(css, /linear-gradient\(var\(--db-image-scrim\), var\(--db-image-scrim\)\)/);
  assert.match(css, /\[data-testid=view_all_chats_button\]/);
  assert.match(css, /\[data-testid=chat_input\] button:not/);
  assert.match(css, /#flow_chat_sidebar \{\s+background: color-mix\(in srgb, var\(--db-surface\) 92%/);
});

test("keeps right-panel new-tab actions on the themed float surface", () => {
  const css = cssFor({
    accent: "#8BA9D6",
    secondary: "#C5A46D",
    surface: "#121B2E",
    text: "#F4F1EA",
  });

  assert.match(css, /\[data-testid=right-panel-container\] \{/);
  assert.match(css, /--s-color-bg-float: color-mix\(in srgb, var\(--db-surface\) 96%, transparent\) !important;/);
});

test("keeps message source badges and diagram controls readable", () => {
  const css = cssFor({
    accent: "#D9B45A",
    secondary: "#769998",
    surface: "#16302F",
    text: "#F6F3E8",
  });

  assert.match(css, /\[data-testid=message_text_content\] \{\s+--s-color-text-tertiary:/);
  assert.match(css, /--s-color-bg-trans: color-mix\(in srgb, var\(--db-text\) 9%, transparent\) !important;/);
  assert.match(css, /\[data-testid=message_text_content\] \[class\*=tabbar-\] \{/);
  assert.match(css, /\[data-testid=message_text_content\] \[class\*=tabbar-\] \[data-testid\^=diagram-\],/);
  assert.match(css, /\[data-testid=message_text_content\] \[class\*=tabbar-\] \[role=tab\]\[aria-selected=true\] \{/);
  assert.match(css, /\[data-testid=message_text_content\] \[class\*=tabbar-\] svg \*/);
});

test("keeps the image editor on an independent dark semantic surface", () => {
  const css = cssFor({
    accent: "#797493",
    secondary: "#756479",
    surface: "#F7F7FA",
    text: "#0F172A",
  });

  assert.match(css, /\[data-testid=image_editor_panel\] \{/);
  assert.match(css, /--db-preview-surface: #1a1a1a;/);
  assert.match(css, /--dbx-bg-base-5: var\(--db-preview-surface\) !important;/);
  assert.match(css, /--color-dbx-bg-base-5: var\(--db-preview-surface\) !important;/);
  assert.match(css, /\[data-onboarding-id=header_control_bar\]/);
  assert.match(css, /\[data-testid=control_bar_action_list\]/);
  assert.match(css, /\[data-testid=edit_image_download_button\]/);
  assert.match(css, /background: var\(--db-action-accent\) !important;/);
});

test("keeps the auto-broadcast control readable in both states", () => {
  const css = cssFor({
    accent: "#F2801E",
    secondary: "#C65A21",
    surface: "#17110B",
    text: "#FFE3C2",
  });

  assert.match(css, /button\[aria-label\*="自动播报"\] \{/);
  assert.match(css, /button\[aria-label\^="关闭"\]\[aria-label\*="自动播报"\]/);
  assert.match(css, /fill: currentColor !important;/);
  assert.match(css, /background: var\(--db-action-accent\) !important;/);
});

test("themes current and legacy input suggestion panels instead of leaving them white", () => {
  const css = cssFor({
    accent: "#24C9D7",
    secondary: "#EF8FD3",
    surface: "#0F1C22",
    text: "#F8FAFC",
  });

  // 新版稳定属性节点和旧版 suggestionHost 都必须接管写死 #fff 的 fallback 变量。
  assert.match(css, /\[data-input-engine-suggestion-panel=true\],/);
  assert.match(css, /\[class\*=suggestionHost-\] \{/);
  assert.match(css, /--input-engine-suggestion-area-background: color-mix\(in srgb, var\(--db-surface\) 96%, transparent\) !important;/);
  assert.match(css, /--input-guidance-input-container-background: color-mix\(in srgb, var\(--db-surface\) 96%, transparent\) !important;/);
  assert.match(css, /\[data-input-engine-suggestion-panel=true\] \[data-suggestion-group-label=true\] \{/);
  assert.match(css, /\[data-input-engine-suggestion-panel=true\] \[role=option\],/);
  // 旧版内层铺白的 area- / groupLabel- 置透明，露出 host 主题磨砂底。
  assert.match(css, /\[class\*=suggestionHost-\] \[class\*=area-\],/);
  // 两个版本的列表项文字都兜底跟随主题文字色。
  assert.match(css, /\[class\*=suggestionHost-\] \[class\*=standardLabel-\],/);
});
