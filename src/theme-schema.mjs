import { lstat, readFile, realpath } from "node:fs/promises";
import {
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";

import { THEME_SCHEMA_VERSION } from "./constants.mjs";

const COLOR_KEYS = ["accent", "secondary", "surface", "text"];
const COPY_KEYS = ["brand", "headline", "tagline"];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const THEME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_COLORS = {
  accent: "#4BC2E0",
  secondary: "#AD7ED5",
  surface: "#FAFAFF",
  text: "#122C60",
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInside(root, candidate) {
  const relativePath = relative(root, candidate);
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

function normalizeHero(hero) {
  if (
    typeof hero !== "string" ||
    !hero.trim() ||
    isAbsolute(hero) ||
    win32.isAbsolute(hero) ||
    hero.split(/[\\/]+/).includes("..")
  ) {
    throw new Error("theme hero must be a relative path inside the theme directory");
  }
  if (!IMAGE_EXTENSIONS.has(extname(hero).toLowerCase())) {
    throw new Error("theme hero must be PNG, JPEG, or WebP");
  }
  return hero;
}

function normalizeColors(colors) {
  if (colors != null && !isRecord(colors)) {
    throw new Error("theme colors must be an object");
  }
  return Object.fromEntries(
    COLOR_KEYS.map((key) => {
      const configured = colors?.[key];
      const value = configured === undefined ? DEFAULT_COLORS[key] : configured;
      if (typeof value !== "string" || !HEX_COLOR.test(value)) {
        throw new Error(`${key} must be a six-digit hex color`);
      }
      return [key, value.toUpperCase()];
    }),
  );
}

function normalizeCopy(copy) {
  if (copy == null) return null;
  if (!isRecord(copy)) {
    throw new Error("theme copy must be null or an object");
  }

  return Object.fromEntries(
    COPY_KEYS.filter((key) => copy[key] !== undefined).map((key) => {
      if (typeof copy[key] !== "string") {
        throw new Error(`copy.${key} must be a string`);
      }
      return [key, copy[key]];
    }),
  );
}

export function validateThemeManifest(input) {
  if (!isRecord(input)) {
    throw new Error("theme manifest must be an object");
  }
  if (input.schemaVersion !== THEME_SCHEMA_VERSION) {
    throw new Error(`unsupported theme schema ${input.schemaVersion}`);
  }
  if (typeof input.id !== "string" || !THEME_ID.test(input.id)) {
    throw new Error("theme id must use lowercase letters, numbers, and hyphens");
  }
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new Error("theme name must be a non-empty string");
  }

  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    id: input.id,
    name: input.name.trim(),
    hero: normalizeHero(input.hero),
    colors: normalizeColors(input.colors),
    copy: normalizeCopy(input.copy),
  };
}

export async function loadTheme(themeDir) {
  const root = resolve(themeDir);
  const raw = JSON.parse(await readFile(join(root, "theme.json"), "utf8"));
  const manifest = validateThemeManifest(raw);
  const heroPath = resolve(root, manifest.hero);
  if (!isInside(root, heroPath)) {
    throw new Error("theme hero escapes the theme directory");
  }

  const [realRoot, realHeroPath] = await Promise.all([
    realpath(root),
    realpath(heroPath),
  ]);
  if (!isInside(realRoot, realHeroPath)) {
    throw new Error("theme hero escapes the theme directory");
  }

  const info = await lstat(heroPath);
  if (!info.isFile() || info.size < 1) {
    throw new Error("theme hero must be a non-empty file");
  }

  return { manifest, heroPath, root };
}
