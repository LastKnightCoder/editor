import fs from "node:fs";
import path from "node:path";
import {
  hasIconSet,
  iconSetDirectory,
  readIconFilenames,
  sourceDirectory,
} from "./ios-icon-set.mjs";

// gen/apple 存在时 tauri icon 只写生成工程，须紧接其后把结果回收到已提交的 icons/ios，
// 否则 sync:ios:icons 会用旧图覆盖新生成的图标。
if (!hasIconSet()) {
  console.log("iOS 工程未初始化，跳过回收 iOS 图标");
  process.exit(0);
}

const filenames = readIconFilenames();
for (const filename of filenames) {
  if (!fs.existsSync(path.join(iconSetDirectory, filename))) {
    throw new Error(`生成工程缺少 iOS 图标 ${filename}，请检查 tauri icon 输出`);
  }
}

fs.mkdirSync(sourceDirectory, { recursive: true });
for (const filename of filenames) {
  fs.copyFileSync(path.join(iconSetDirectory, filename), path.join(sourceDirectory, filename));
}
console.log(`已回收 ${filenames.length} 张 iOS 应用图标到 src-tauri/icons/ios`);
