import { readFile, mkdir, mkdtemp, rename, rm, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(manifest.id)) throw new Error("插件 ID 无效");
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)) throw new Error("插件版本无效");
const root = path.join(homedir(), ".editor/plugins");
const target = path.join(root, manifest.id);
try {
  await lstat(target);
  throw new Error(`目标已存在，请先停用插件并备份或移走旧目录：${target}`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const zip = new AdmZip(path.resolve("dist", `${manifest.id}-${manifest.version}.zip`));
const entries = zip.getEntries().filter(entry => !entry.isDirectory);
const packaged = JSON.parse(zip.readAsText(`${manifest.id}/manifest.json`));
if (
  packaged.main !== "main.js" ||
  (packaged.styles !== undefined && packaged.styles !== "main.css") ||
  packaged.sync !== undefined
)
  throw new Error("ZIP入口与模板约定不一致");
const allowed = ["manifest.json", "main.js", "main.css", "README.md", "LICENSE", "CHANGELOG.md"];
for (const entry of entries) {
  if (!allowed.some(file => entry.entryName === `${manifest.id}/${file}`))
    throw new Error("ZIP 包含非约定文件");
}
if (packaged.id !== manifest.id || packaged.version !== manifest.version)
  throw new Error("ZIP 与当前 manifest 不一致，请重新构建");
for (const file of ["main.js", ...(packaged.styles ? ["main.css"] : [])]) {
  const bytes = zip.readFile(`${manifest.id}/${file}`);
  if (!bytes || createHash("sha256").update(bytes).digest("hex") !== packaged.integrity?.[file])
    throw new Error(`产物校验失败：${file}`);
}
await mkdir(root, { recursive: true });
const staging = await mkdtemp(path.join(root, ".installing-"));
try {
  zip.extractAllTo(staging, false);
  await rename(path.join(staging, manifest.id), target);
  console.log(`已安装：${target}\n在 Tau 插件管理中刷新列表并启用“${manifest.name}”。`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
