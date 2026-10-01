// antd 退场棘轮（docs/redesign/01-重构蓝图.md §3.6）：
// scripts/antd-whitelist.json 是存量白名单的唯一事实源，.eslintrc.cjs require 它做豁免，
// 本脚本保证白名单只减不增——迁移一处就收缩一处，防止豁免面回涨。
//
//   node scripts/antd-ratchet.mjs            打印白名单与现状对比
//   node scripts/antd-ratchet.mjs --list     列出仍在 import antd 的文件
//   node scripts/antd-ratchet.mjs --check    白名单外有新增、或白名单过时未收缩 → 失败
//   node scripts/antd-ratchet.mjs --prune    白名单收缩为当前现状（存在新增时拒绝）
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WHITELIST_FILE = join(ROOT, "scripts/antd-whitelist.json");
const SKIP_DIRS = new Set(["node_modules", "dist", "output"]);
const SOURCE = /\.(ts|tsx)$/;
// antd 深路径（antd/es/*、antd/locale/*）与 @ant-design/*（icons / charts）都算
const ANTD_IMPORT = /from ["'](?:antd(?:\/[^"']*)?|@ant-design\/[^"']*)["']/;

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    // 统一成 / 分隔：白名单与 eslint files 都按 posix 路径写
    else if (SOURCE.test(name) && ANTD_IMPORT.test(readFileSync(full, "utf8")))
      out.push(relative(ROOT, full).replaceAll("\\", "/"));
  }
  return out;
};

const args = new Set(process.argv.slice(2));
const whitelist = JSON.parse(readFileSync(WHITELIST_FILE, "utf8"));
const current = walk(join(ROOT, "apps"))
  .concat(walk(join(ROOT, "packages")))
  .concat(walk(join(ROOT, "editor-extensions")))
  .concat(walk(join(ROOT, "examples")))
  .sort();

const added = current.filter(file => !whitelist.includes(file));
const removable = whitelist.filter(file => !current.includes(file));

console.log(
  `antd 白名单 ${whitelist.length} 个文件，现状 ${current.length}（新增 ${added.length}，可收缩 ${removable.length}）`
);
if (args.has("--list")) for (const file of current) console.log(`    ${file}`);
if (added.length) {
  console.error("\n以下白名单外文件 import 了 antd / @ant-design，禁止新增：");
  for (const file of added) console.error(`    ${file}`);
}
if (removable.length) {
  console.error("\n以下白名单文件已清空 antd，请运行 node scripts/antd-ratchet.mjs --prune 收缩：");
  for (const file of removable) console.error(`    ${file}`);
}

if (args.has("--prune")) {
  if (added.length) {
    console.error("\n[antd-ratchet] 存在白名单外新增，拒绝收缩：先迁移上述文件再运行 --prune");
    process.exit(1);
  }
  writeFileSync(WHITELIST_FILE, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`\n已收缩 ${removable.length} 项，白名单写入 ${relative(ROOT, WHITELIST_FILE)}`);
}

if (args.has("--check") && (added.length || removable.length)) {
  console.error(
    "\n[antd-ratchet] 白名单与现状不一致：新增不许进来，清零必须收缩。见 docs/redesign/01-重构蓝图.md §3.6"
  );
  process.exit(1);
}
