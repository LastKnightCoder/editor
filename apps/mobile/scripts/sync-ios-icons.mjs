import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(projectRoot, "src-tauri", "icons", "ios");
const iconSetDirectory = path.join(
  projectRoot,
  "src-tauri",
  "gen",
  "apple",
  "Assets.xcassets",
  "AppIcon.appiconset"
);
const contentsPath = path.join(iconSetDirectory, "Contents.json");

if (!fs.existsSync(contentsPath)) {
  throw new Error("iOS 工程未初始化，请先运行 pnpm exec tauri ios init");
}

const contents = JSON.parse(fs.readFileSync(contentsPath, "utf8"));
const filenames = [...new Set(contents.images.map(image => image.filename))];
if (filenames.length === 0) {
  throw new Error("iOS AppIcon 清单为空，无法同步应用图标");
}

// 先确认全部来源存在，避免缺图时继续使用生成工程中的默认图标。
for (const filename of filenames) {
  if (typeof filename !== "string" || path.basename(filename) !== filename) {
    throw new Error("iOS AppIcon 清单包含无效文件名");
  }
  if (!fs.existsSync(path.join(sourceDirectory, filename))) {
    throw new Error(`缺少 iOS 图标 ${filename}，请先运行 pnpm icon:regen`);
  }
}

execFileSync(
  "xcrun",
  [
    "swift",
    path.join(projectRoot, "scripts", "write-opaque-ios-icons.swift"),
    sourceDirectory,
    iconSetDirectory,
    ...filenames,
  ],
  { stdio: "inherit" }
);
console.log(`已同步 ${filenames.length} 张 iOS 应用图标`);
