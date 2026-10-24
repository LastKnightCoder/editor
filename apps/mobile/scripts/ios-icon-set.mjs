import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 已提交的 iOS 图标来源；生成工程 gen/apple 不入库
export const sourceDirectory = path.join(projectRoot, "src-tauri", "icons", "ios");
export const iconSetDirectory = path.join(
  projectRoot,
  "src-tauri",
  "gen",
  "apple",
  "Assets.xcassets",
  "AppIcon.appiconset"
);
const contentsPath = path.join(iconSetDirectory, "Contents.json");

export function hasIconSet() {
  return fs.existsSync(contentsPath);
}

/** 读取生成工程 AppIcon 清单引用的全部文件名 */
export function readIconFilenames() {
  if (!hasIconSet()) {
    throw new Error("iOS 工程未初始化，请先运行 pnpm exec tauri ios init");
  }
  const contents = JSON.parse(fs.readFileSync(contentsPath, "utf8"));
  const filenames = [...new Set(contents.images.map(image => image.filename))];
  if (filenames.length === 0) {
    throw new Error("iOS AppIcon 清单为空，无法同步应用图标");
  }
  for (const filename of filenames) {
    if (typeof filename !== "string" || path.basename(filename) !== filename) {
      throw new Error("iOS AppIcon 清单包含无效文件名");
    }
  }
  return filenames;
}
