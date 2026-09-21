#!/usr/bin/env node
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DEFAULT_THEME_ID, getDoubaoClient, resolveStudioPaths } from "./constants.mjs";
import { applySkin, removeSkin, skinStatus } from "./injector.mjs";
import { loadTheme } from "./theme-schema.mjs";
import { createSingleImageTheme, listThemes } from "./theme-store.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function options(argv) {
  const result = {};
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`无法识别的参数：${key}`);
    const separator = key.indexOf("=");
    if (separator > 2) {
      const name = key.slice(2, separator);
      const value = key.slice(separator + 1);
      if (!value) throw new Error(`--${name} 缺少值`);
      result[name] = value;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} 缺少值`);
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

function portFrom(value, defaultPort) {
  const port = value === undefined ? defaultPort : Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port 必须是 1024 到 65535 的整数");
  return port;
}

function defaults(overrides) {
  const paths = resolveStudioPaths();
  return {
    bundledThemesRoot: join(sourceRoot, "themes"),
    userThemesRoot: paths.userThemesRoot,
    loadTheme,
    listThemes,
    createSingleImageTheme,
    applySkin,
    removeSkin,
    skinStatus,
    ...overrides,
  };
}

export async function runCli(argv, overrides = {}) {
  const command = argv[0] ?? "help";
  const args = options(argv);
  const deps = defaults(overrides);
  const roots = [deps.bundledThemesRoot, deps.userThemesRoot];

  if (command === "help") {
    return {
      commands: ["list", "create --image PATH --name NAME", "apply [--theme ID] [--client personal|work] [--port PORT]", "pause", "status", "doctor"],
    };
  }
  if (command === "list") return deps.listThemes({ roots });
  if (command === "create") {
    if (!args.image) throw new Error("create 需要 --image");
    if (!args.name) throw new Error("create 需要 --name");
    return deps.createSingleImageTheme({ imagePath: args.image, name: args.name, storeRoot: deps.userThemesRoot });
  }
  if (command === "apply") {
    const client = getDoubaoClient(args.client);
    // 用户显式传了 --theme 才算"指定主题"；裸 apply（技能重启后走这条）恢复上次皮肤
    const explicit = args.theme !== undefined;
    const themeId = args.theme ?? DEFAULT_THEME_ID;
    const themes = await deps.listThemes({ roots });
    const selected = themes.find((theme) => theme.id === themeId);
    if (!selected) throw new Error(`找不到主题：${themeId}`);
    const loadedTheme = await deps.loadTheme(selected.path);
    const menuThemes = [];
    for (const theme of themes) {
      if (theme.id === themeId) {
        menuThemes.push(loadedTheme);
        continue;
      }
      try {
        menuThemes.push(await deps.loadTheme(theme.path));
      } catch {
        // 坏主题不阻塞换肤，只是不进菜单
      }
    }
    return deps.applySkin({
      loadedTheme,
      themes: menuThemes,
      port: portFrom(args.port, client.defaultCdpPort),
      rendererHint: client.rendererUrlHint,
      explicit,
    });
  }
  if (command === "pause" || command === "restore") {
    const client = getDoubaoClient(args.client);
    return deps.removeSkin({
      port: portFrom(args.port, client.defaultCdpPort),
      rendererHint: client.rendererUrlHint,
    });
  }
  if (command === "status") {
    const client = getDoubaoClient(args.client);
    return deps.skinStatus({
      port: portFrom(args.port, client.defaultCdpPort),
      rendererHint: client.rendererUrlHint,
    });
  }
  if (command === "doctor") {
    const client = getDoubaoClient(args.client);
    const exists = async (path) => access(path).then(() => true, () => false);
    if (process.platform === "win32") {
      const environmentPath = client.id === "work"
        ? process.env.DOUBAO_WORK_EXE
        : process.env.DOUBAO_EXE;
      const candidates = [
        environmentPath,
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, client.windowsInstallDirectory, client.windowsExecutable),
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", client.windowsInstallDirectory, client.windowsExecutable),
        process.env.ProgramFiles && join(process.env.ProgramFiles, client.windowsInstallDirectory, client.windowsExecutable),
        process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], client.windowsInstallDirectory, client.windowsExecutable),
      ].filter(Boolean);
      let app = null;
      for (const c of candidates) {
        if (await exists(c)) { app = c; break; }
      }
      return {
        platform: "win32",
        client: client.id,
        app,
        appFound: !!app,
        candidates,
        cdpPort: client.defaultCdpPort,
        rendererHint: client.rendererUrlHint,
        installRoot: resolveStudioPaths().installRoot,
      };
    }
    const app = client.darwinAppPath;
    return {
      platform: "darwin",
      client: client.id,
      app,
      appFound: await exists(app),
      bundleId: client.darwinBundleId,
      cdpPort: client.defaultCdpPort,
      rendererHint: client.rendererUrlHint,
      installRoot: resolveStudioPaths().installRoot,
    };
  }
  throw new Error(`未知命令：${command}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`Doubao Skin Studio：${error.message}\n`);
      process.exitCode = 1;
    });
}
