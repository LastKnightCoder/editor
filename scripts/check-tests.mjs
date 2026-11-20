// 测试体检：skip 台账、巨型文件、快照使用、空体用例、console.log 残留。
// 只报不拦（零误报的结构信号，供人判断）；规则出处见 AGENTS.md「测试投入规则」与「测试退出机制」。
import { readdirSync, readFileSync } from "node:fs";
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
  "coverage",
  "test-results",
  "__snapshots__",
]);
const BIG_FILE_LINES = 800;

const testFiles = [];
const walk = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // 评测脚本走独立 vitest.eval.config，不进默认收集，不属本台账管辖
      if (full.endsWith("src-electron/eval")) continue;
      walk(full);
    } else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) testFiles.push(full);
  }
};
for (const dir of ["apps", "packages", "examples", "plugins", "scripts"]) {
  walk(join(root, dir));
}

// 每条信号：[文件相对路径:行号] 说明
const skips = []; // 裸 .skip / .todo：规范上不允许无死因静默跳过
const gates = []; // 环境门控（vitest skipIf/runIf、Playwright 带理由的 test.skip(条件,"理由")）：合法但要入台账（连续一季未真跑 → 退出机制）
const snapshots = []; // 规范禁止快照；存量有意保留的在此可见
const empties = []; // 单行空体用例：恒真
const logs = []; // console.log 残留
const bigFiles = []; // 超过 BIG_FILE_LINES 行：拆分信号

const RE = {
  skip: /\b(?:it|test|describe)\.skip\s*\(/g,
  todo: /\b(?:it|test)\.todo\s*\(/,
  gate: /\b(?:it|test|describe)\.(?:skipIf|runIf)\s*\(/,
  snapshot: /toMatchInlineSnapshot|toMatchSnapshot/,
  empty: /\b(?:it|test|describe)\s*\(\s*["'`][^"'`]*["'`]\s*,\s*\(\s*\)?\s*=>\s*\{\s*\}\s*\)/,
  log: /\bconsole\.log\s*\(/,
};

for (const file of testFiles) {
  const rel = relative(root, file);
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  if (lines.length > BIG_FILE_LINES) bigFiles.push(`${rel}（${lines.length} 行）`);
  // .skip 用多行匹配：Playwright 的 test.skip(条件, "理由") 带理由参数属合法门控（记 gates），
  // 无理由参数的裸 skip（含恒真/声明式 it.skip）才进裸 skip 清单
  for (const match of src.matchAll(RE.skip)) {
    const at = `${rel}:${src.slice(0, match.index).split("\n").length}`;
    const hasReason = /,\s*(?:"[^"]*"|'[^']*'|`[^`]*`)\s*\)/.test(
      src.slice(match.index, match.index + 250)
    );
    hasReason ? gates.push(at) : skips.push(at);
  }
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (RE.todo.test(line)) skips.push(`${at}（todo）`);
    if (RE.gate.test(line)) gates.push(at);
    if (RE.snapshot.test(line)) snapshots.push(at);
    if (RE.empty.test(line)) empties.push(at);
    if (RE.log.test(line)) logs.push(at);
  });
}

const sections = [
  ["裸 skip / todo（无死因静默跳过，须修或注明死因）", skips],
  ["环境门控 skipIf / runIf（合法；连续一季未真跑触发退出机制）", gates],
  ["快照断言（规范禁止新增；存量保留须在此台账可见）", snapshots],
  ["单行空体用例（恒真）", empties],
  ["console.log 残留", logs],
  [`超过 ${BIG_FILE_LINES} 行的测试文件（拆分信号）`, bigFiles],
];

for (const [title, items] of sections) {
  console.log(`\n## ${title}：${items.length} 处`);
  for (const item of items) console.log(`  - ${item}`);
}

const total = sections.reduce((sum, [, items]) => sum + items.length, 0);
console.log(
  `\ncheck-tests 完成：${testFiles.length} 个测试文件，${total} 项结构信号（均为报告不拦截）。`
);
