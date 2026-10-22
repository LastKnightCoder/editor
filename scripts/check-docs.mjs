// 文档体检：死链（硬失败）、notes/tasks 超期与命名（notes 前缀硬失败，超期警告）、活文档状态字样（警告）。
// 规则出处见 AGENTS.md「文档维护规则」。
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  "release",
  "target",
  "worktrees",
  ".claude",
  ".zcode",
  ".venv",
  "content",
]);
const NINETY_DAYS_MS = 90 * 24 * 3600 * 1000;

const mdFiles = [];
const walk = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".md")) mdFiles.push(full);
  }
};
walk(join(root, "docs"));
walk(join(root, "apps"));
walk(join(root, "packages"));
for (const extra of ["AGENTS.md", "README.md"]) {
  const p = join(root, extra);
  if (existsSync(p)) mdFiles.push(p);
}

const hard = [];
const warnings = [];

// 1. 死链：`[x](path)`；`/` 开头按仓库根解析（AGENTS.md 链接规则），否则相对当前文件。行内代码与围栏代码块内的示例不算链接。
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const stripCode = text => text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
for (const file of mdFiles) {
  const text = stripCode(readFileSync(file, "utf8"));
  for (const [, raw] of text.matchAll(LINK_RE)) {
    if (/^([a-z][a-z0-9+.-]*:|#)/i.test(raw)) continue;
    const target = raw.split("#")[0];
    if (!target) continue;
    const resolved = target.startsWith("/") ? join(root, target) : resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      hard.push(`${relative(root, file)} → ${raw}`);
    }
  }
}

// 2. notes：日期前缀（硬失败）与超 90 天（警告）。
const notesDir = join(root, "docs", "notes");
if (existsSync(notesDir)) {
  for (const name of readdirSync(notesDir)) {
    if (!name.endsWith(".md")) continue;
    const m = name.match(/^(\d{4}-\d{2}-\d{2})-/);
    if (!m) {
      hard.push(`docs/notes/${name} 缺日期前缀`);
      continue;
    }
    const age = Date.now() - new Date(m[1]).getTime();
    if (age > NINETY_DAYS_MS) warnings.push(`docs/notes/${name} 已超 90 天，可清理`);
  }
}

// 3. tasks：文件超 90 天未动（警告）。
const tasksDir = join(root, "docs", "tasks");
if (existsSync(tasksDir)) {
  for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
    if (entry.name === "README.md") continue;
    const full = join(tasksDir, entry.name);
    if (Date.now() - statSync(full).mtimeMs > NINETY_DAYS_MS) {
      warnings.push(`docs/tasks/${entry.name} 超 90 天未更新，确认是否该退役`);
    }
  }
}

// 4. 活文档状态字样（警告）：architecture/guides/decisions 与 docs 根文档禁止携带会腐烂的状态。
const STATE_RE = /待验收|待视觉验收|待合并|待用户决定/;
const exempt = new Set(["docs/README.md", "docs/tasks/README.md"]);
for (const file of mdFiles) {
  const rel = relative(root, file);
  const inDocsRoot = /^docs\/[^/]+\.md$/.test(rel);
  const inLivingDir = /^docs\/(architecture|guides|decisions)\//.test(rel);
  if (!inDocsRoot && !inLivingDir) continue;
  if (exempt.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (STATE_RE.test(line))
      warnings.push(`${rel}:${i + 1} 含状态字样：${line.trim().slice(0, 60)}`);
  });
}

for (const w of warnings) console.warn(`⚠ ${w}`);
if (hard.length) {
  for (const h of hard) console.error(`✗ 死链或违规命名：${h}`);
  console.error(`\ncheck-docs 失败：${hard.length} 处硬错误，${warnings.length} 处警告`);
  process.exit(1);
}
console.log(`check-docs 通过（${mdFiles.length} 个 md；${warnings.length} 处警告）`);
