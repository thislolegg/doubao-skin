import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// 内置主题在 🎨 菜单里的展示顺序（listThemes 会据此排序）。
// 表内主题按此处顺序排；不在表内的（如用户自建主题）排在其后，按名称排序。
const BUILTIN_ORDER = [
  "jade-rabbit",      // 玉兔捣药（中秋）
  "mid-autumn-change",// 嫦娥玉桂（中秋）
  "lantern-moon",     // 花前月下（中秋）
  "god-of-wealth",    // 财神到
  "change-benyue",    // 嫦娥奔月（默认）
  "monkey-king",      // 齐天大圣
  "nezha",            // 哪吒
  "chinese-dragon",   // 中国龙
  "dunhuang-feitian", // 敦煌飞天
  "nine-tailed-fox",  // 九尾狐
  "panda",            // 国宝熊猫
  "koi-fish",         // 锦鲤
  "hua-mulan",        // 花木兰
];

function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "custom-skin";
}

export async function createSingleImageTheme({ imagePath, name, storeRoot, colors = {} }) {
  const extension = extname(imagePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new Error("素材必须是 PNG、JPG、JPEG 或 WebP 图片");
  }
  const source = await stat(imagePath);
  if (!source.isFile() || source.size === 0) throw new Error("素材图片不存在或为空");

  const digest = createHash("sha256")
    .update(`${name}\0${basename(imagePath)}\0${source.size}\0${source.mtimeMs}`)
    .digest("hex")
    .slice(0, 8);
  const id = `${slugify(name)}-${digest}`;
  const destination = join(storeRoot, id);
  const temporary = `${destination}.tmp-${process.pid}`;
  const hero = `hero${extension}`;
  const manifest = {
    schemaVersion: 1,
    id,
    name,
    hero,
    colors: {
      accent: colors.accent ?? "#24c9d7",
      secondary: colors.secondary ?? "#ef8fd3",
      surface: colors.surface ?? "#f7fbff",
      text: colors.text ?? "#17344f",
    },
    copy: null,
  };

  await mkdir(storeRoot, { recursive: true });
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  try {
    await copyFile(imagePath, join(temporary, hero));
    await writeFile(join(temporary, "theme.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await rm(destination, { recursive: true, force: true });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return { id, path: destination, manifest };
}

export async function listThemes({ roots }) {
  const themes = [];
  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const manifest = JSON.parse(await readFile(join(root, entry.name, "theme.json"), "utf8"));
        themes.push({ ...manifest, path: join(root, entry.name) });
      } catch {
        // A half-copied folder is ignored so listing remains fast and useful.
      }
    }
  }
  // 按 BUILTIN_ORDER 排；表外主题（用户自建）排在末尾，彼此按名称排序。
  const rank = (id) => {
    const index = BUILTIN_ORDER.indexOf(id);
    return index === -1 ? BUILTIN_ORDER.length : index;
  };
  return themes.sort((a, b) => {
    const ra = rank(a.id);
    const rb = rank(b.id);
    return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
  });
}
