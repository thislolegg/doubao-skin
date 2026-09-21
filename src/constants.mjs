import { homedir } from "node:os";
import { join } from "node:path";

export const PRODUCT_ID = "doubao-skin-studio";
export const PRODUCT_NAME = "Doubao Skin Studio";
export const STATE_SCHEMA_VERSION = 1;
export const THEME_SCHEMA_VERSION = 1;
export const DEFAULT_THEME_ID = "jade-rabbit";
export const DEFAULT_CLIENT_ID = "personal";
export const DOUBAO_CLIENTS = Object.freeze({
  personal: Object.freeze({
    id: "personal",
    name: "豆包",
    defaultCdpPort: 9333,
    rendererUrlHint: "doubao-chat",
    darwinAppPath: "/Applications/Doubao.app",
    darwinBundleId: "com.bot.pc.doubao",
    darwinExecutable: "Doubao",
    windowsExecutable: "Doubao.exe",
    windowsInstallDirectory: "Doubao",
  }),
  work: Object.freeze({
    id: "work",
    name: "豆包工作",
    // 独立端口允许豆包与豆包工作同时开启，且不会把皮肤注入另一客户端。
    defaultCdpPort: 9334,
    rendererUrlHint: "doubaowork-chat",
    darwinAppPath: "/Applications/DoubaoWork.app",
    darwinBundleId: "com.work.pc.doubao",
    darwinExecutable: "DoubaoWork",
    windowsExecutable: "DoubaoWork.exe",
    windowsInstallDirectory: "DoubaoWork",
  }),
});

export function getDoubaoClient(clientId = DEFAULT_CLIENT_ID) {
  const client = DOUBAO_CLIENTS[clientId];
  if (!client) {
    throw new Error(`--client 必须是 ${Object.keys(DOUBAO_CLIENTS).join(" 或 ")}`);
  }
  return client;
}

// 保留原导出，兼容默认（个人版）客户端的现有调用。
export const DEFAULT_CDP_PORT = DOUBAO_CLIENTS.personal.defaultCdpPort;
export const EXPECTED_BUNDLE_ID = DOUBAO_CLIENTS.personal.darwinBundleId;
export const RENDERER_URL_HINT = DOUBAO_CLIENTS.personal.rendererUrlHint;

export function resolveStudioPaths({ home = homedir() } = {}) {
  const isWin = process.platform === "win32";
  const installRoot = join(home, ".doubao", PRODUCT_ID);
  const stateRoot = isWin
    ? join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "DoubaoSkinStudio")
    : join(home, "Library", "Application Support", "DoubaoSkinStudio");

  return {
    installRoot,
    stateRoot,
    statePath: join(stateRoot, "state.json"),
    logPath: join(stateRoot, "injector.log"),
    userThemesRoot: join(stateRoot, "themes"),
  };
}
