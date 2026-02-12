import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");
const androidStringsPath = path.join(
  projectRoot,
  "src-tauri",
  "gen",
  "android",
  "app",
  "src",
  "main",
  "res",
  "values",
  "strings.xml",
);

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

if (!fs.existsSync(tauriConfigPath)) {
  console.error(`缺少 Tauri 配置文件: ${tauriConfigPath}`);
  process.exit(1);
}

if (!fs.existsSync(androidStringsPath)) {
  console.log(`Android 工程未初始化，跳过名称同步: ${androidStringsPath}`);
  process.exit(0);
}

const tauriConfigRaw = fs.readFileSync(tauriConfigPath, "utf8");
const tauriConfig = JSON.parse(tauriConfigRaw);
const productName = String(tauriConfig.productName ?? "").trim();

if (!productName) {
  console.error(`tauri.conf.json 未设置 productName: ${tauriConfigPath}`);
  process.exit(1);
}

const escapedName = escapeXml(productName);
const stringsRaw = fs.readFileSync(androidStringsPath, "utf8");

const updated = stringsRaw
  .replace(
    /<string name="app_name">[\s\S]*?<\/string>/,
    `<string name="app_name">${escapedName}</string>`,
  )
  .replace(
    /<string name="main_activity_title">[\s\S]*?<\/string>/,
    `<string name="main_activity_title">${escapedName}</string>`,
  );

if (updated === stringsRaw) {
  console.log(`未检测到可更新的 app_name/main_activity_title: ${androidStringsPath}`);
  process.exit(0);
}

fs.writeFileSync(androidStringsPath, updated, "utf8");
console.log(`已同步 Android 应用名称为 "${productName}"`);
