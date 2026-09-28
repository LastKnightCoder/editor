// Editor 职责重构的基线统计与防回流检查（见 docs/editor-refactor/02-阶段计划.md P0）。
//
//   node scripts/editor-refactor-baseline.mjs            打印各指标计数
//   node scripts/editor-refactor-baseline.mjs --list     同时列出命中文件
//   node scripts/editor-refactor-baseline.mjs --check    任一指标超过基线即失败（加 --quiet 只输出超出项）
//   node scripts/editor-refactor-baseline.mjs --update   把当前计数写回基线（只允许下降）
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = join(ROOT, "scripts/editor-refactor-baseline.json");
const SKIP_DIRS = new Set(["node_modules", "dist", "output"]);
const SOURCE = /\.(tsx?|css|less)$/;
const TEST_FILE = /\.test\.[tj]sx?$/;

const isTest = file => TEST_FILE.test(file) || file.includes("/__tests__/");

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name)) out.push(full);
  }
  return out;
};

const cache = new Map();
const filesOf = roots =>
  roots.flatMap(root => {
    if (!cache.has(root)) cache.set(root, walk(join(ROOT, root)));
    return cache.get(root);
  });
const read = file => readFileSync(file, "utf8");

const EDITOR = ["packages/editor/src"];
const ALL_APPS_AND_PACKAGES = [
  "apps/desktop/src",
  "apps/desktop/e2e",
  "apps/blog/src",
  "apps/mobile/src",
  "apps/browser-extension/src",
  "packages/editor/src",
  "packages/editor-webview/src",
  "packages/ui/src",
];

/**
 * 两种计数方式：
 *  - files：命中正则的文件数
 *  - distinct：所有文件中命中片段去重后的种类数
 *  - occurrences：命中片段总次数
 * 默认不统计测试文件；includeTests 用于「迁移时测试也必须跟着改」的指标。
 */
const METRICS = [
  {
    key: "editor.useThemeColors",
    desc: "editor 内调用 useThemeColors() 的文件",
    roots: EDITOR,
    pattern: /useThemeColors\(/g,
    mode: "files",
  },
  {
    key: "editor.isDark",
    desc: "editor 内使用 isDark 的文件（不含 theme/ 自身——ThemeService 是 isDark 的正源）",
    roots: EDITOR,
    pattern: /\bisDark\b/g,
    mode: "files",
    exclude: [/\/theme\//],
  },
  {
    key: "editor.legacyCssVars",
    desc: "editor 内旧 CSS 变量种类（--th-* / --color-* 等）",
    roots: EDITOR,
    pattern:
      /var\(--(?:th|color|callout|code|mono|overlay|primary|comment|underline|text)-[a-z0-9-]+/g,
    mode: "distinct",
  },
  {
    key: "editor.darkVariants",
    desc: "editor 内 Tailwind dark: 变体次数",
    roots: EDITOR,
    pattern: /\bdark:[a-z][a-z0-9-]*/g,
    mode: "occurrences",
  },
  {
    key: "editor.paletteClasses",
    desc: "editor 内硬编码灰/蓝色阶类次数",
    roots: EDITOR,
    pattern: /\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|blue)-\d+/g,
    mode: "occurrences",
  },
  {
    key: "editor.antdImports",
    desc: "editor 内直接 import antd 的文件",
    roots: EDITOR,
    pattern: /from ["']antd["']/g,
    mode: "files",
  },
  {
    key: "editor.configConsumers",
    desc: "editor 内 useEditorConfig / useEditorEnvironment 的使用文件（不含定义处）",
    roots: EDITOR,
    pattern: /\b(?:useEditorConfig|useEditorEnvironment)\(\)/g,
    mode: "files",
    exclude: [/\/contexts\//],
  },
  {
    key: "repo.editorProviderUsages",
    desc: "editor 包外使用 <EditorProvider> 的文件",
    roots: ALL_APPS_AND_PACKAGES,
    pattern: /<EditorProvider\b/g,
    mode: "files",
    includeTests: true,
    exclude: [/packages\/editor\/src\//],
  },
  {
    key: "repo.uiThemeImports",
    desc: "引用 @tau/ui/theme* 旧路径的文件（P1 清零）",
    roots: ALL_APPS_AND_PACKAGES,
    pattern: /@tau\/ui\/theme/g,
    mode: "files",
    includeTests: true,
  },
  {
    key: "desktop.contentEditorUsages",
    desc: "desktop 使用 <ContentEditor> 的文件",
    roots: ["apps/desktop/src"],
    pattern: /<ContentEditor\b/g,
    mode: "files",
  },
  {
    key: "mobile.collaborationProp",
    desc: "mobile 向编辑器传 collaboration= 的文件",
    roots: ["apps/mobile/src"],
    pattern: /\bcollaboration=\{/g,
    mode: "files",
  },
];

const measure = metric => {
  const files = filesOf(metric.roots).filter(
    file =>
      (metric.includeTests || !isTest(file)) &&
      !(metric.exclude ?? []).some(rule => rule.test(file))
  );
  const hits = new Map();
  for (const file of files) {
    const matches = read(file).match(metric.pattern);
    if (matches) hits.set(relative(ROOT, file), matches);
  }
  if (metric.mode === "files") return { count: hits.size, detail: [...hits.keys()] };
  const all = [...hits.values()].flat();
  if (metric.mode === "occurrences") return { count: all.length, detail: [...hits.keys()] };
  const distinct = [...new Set(all)].sort();
  return { count: distinct.length, detail: distinct };
};

const args = new Set(process.argv.slice(2));
const baseline = existsSync(BASELINE_FILE) ? JSON.parse(read(BASELINE_FILE)) : {};
const results = METRICS.map(metric => ({ metric, ...measure(metric) }));

let failed = false;
for (const { metric, count, detail } of results) {
  const limit = baseline[metric.key];
  const status =
    limit === undefined ? "新指标" : count > limit ? "超出基线" : count < limit ? "已下降" : "持平";
  const exceeded = limit !== undefined && count > limit;
  if (exceeded) failed = true;
  if (args.has("--quiet") && !exceeded) continue;
  console.log(
    `${metric.key.padEnd(30)} ${String(count).padStart(5)}  基线 ${String(limit ?? "-").padStart(5)}  ${status}  ${metric.desc}`
  );
  if (args.has("--list") || (args.has("--check") && exceeded)) {
    for (const item of detail) console.log(`    ${item}`);
  }
}

if (args.has("--update")) {
  const next = Object.fromEntries(
    results.map(({ metric, count }) => {
      const limit = baseline[metric.key];
      if (limit !== undefined && count > limit) {
        throw new Error(`${metric.key} 当前 ${count} 高于基线 ${limit}，基线只允许下降`);
      }
      return [metric.key, count];
    })
  );
  writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\n已写入 ${relative(ROOT, BASELINE_FILE)}`);
}

if (args.has("--check") && failed) {
  console.error(
    "\n[editor-refactor] 以上指标超过基线：迁移期间旧用法只许减少。见 docs/editor-refactor/02-阶段计划.md"
  );
  process.exit(1);
}
