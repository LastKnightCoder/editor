import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  iconSetDirectory,
  projectRoot,
  readIconFilenames,
  sourceDirectory,
} from "./ios-icon-set.mjs";

const filenames = readIconFilenames();

// 先确认全部来源存在，避免缺图时继续使用生成工程中的默认图标。
for (const filename of filenames) {
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
