import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const desktop = resolve(root, "apps/desktop");
const ts = createRequire(resolve(root, "package.json"))("@typescript/typescript6");
const config = ts.readConfigFile(resolve(desktop, "tsconfig.json"), ts.sys.readFile);
assert(!config.error, "桌面 TypeScript 配置不可读");
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, desktop);
const cache = ts.createModuleResolutionCache(desktop, value => value, options);
const graph = new Map();
const canonical = file => realpathSync(file).replaceAll("\\", "/");

function dependencies(file) {
  if (graph.has(file)) return graph.get(file);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const edges = [];
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier) || node.isTypeOnly)
      continue;
    const clause = node.importClause;
    if (clause?.isTypeOnly) continue;
    const bindings = clause?.namedBindings;
    if (
      clause &&
      !clause.name &&
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length &&
      bindings.elements.every(element => element.isTypeOnly)
    )
      continue;
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause) &&
      node.exportClause.elements.length &&
      node.exportClause.elements.every(element => element.isTypeOnly)
    )
      continue;
    const target = ts.resolveModuleName(node.moduleSpecifier.text, file, options, ts.sys, cache)
      .resolvedModule?.resolvedFileName;
    if (!target || target.endsWith(".d.ts")) continue;
    const resolved = canonical(target);
    if (!resolved.startsWith(canonical(root) + "/") || resolved.includes("/node_modules/"))
      continue;
    if (/\.[cm]?tsx?$/.test(resolved)) edges.push(resolved);
  }
  graph.set(file, edges);
  return edges;
}

function rejectStaticDependency(from, to) {
  const source = canonical(resolve(desktop, from));
  const target = canonical(resolve(desktop, to));
  const queue = [source];
  const parents = new Map([[source, null]]);
  for (const file of queue) {
    for (const dependency of dependencies(file)) {
      if (dependency === target) {
        const chain = [relative(root, target)];
        for (let current = file; current; current = parents.get(current))
          chain.unshift(relative(root, current));
        assert.fail("启动静态依赖越界：\n" + chain.join("\n  → "));
      }
      if (parents.has(dependency)) continue;
      parents.set(dependency, file);
      queue.push(dependency);
    }
  }
}

for (const [from, to] of [
  ["src/services/editorKit.ts", "src/editor-extensions/index.ts"],
  ["src/editor-extensions/base.ts", "src/services/editorKit.ts"],
  ["src/editor-extensions/chat-ref/operations.ts", "src/services/editorKit.ts"],
  ["src/editor-extensions/content-link/index.tsx", "src/components/ContentEditor/index.tsx"],
  [
    "src/editor-extensions/chat-ref/index.tsx",
    "src/editor-extensions/chat-ref/components/ChatRefPreviewContent.tsx",
  ],
  ["src/editor-extensions/chat-ref/index.tsx", "src/utils/blockRegistry.ts"],
])
  rejectStaticDependency(from, to);

for (const entry of [
  "src/services/editorKit.ts",
  "src/editor-extensions/base.ts",
  "src/editor-extensions/content-link/index.tsx",
  "src/editor-extensions/chat-ref/index.tsx",
])
  rejectStaticDependency(entry, entry);

console.log("桌面启动边界通过：装配不经扩展桶回流，轻量编辑与引用声明不静态加载重型预览");
