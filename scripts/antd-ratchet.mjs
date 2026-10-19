// 保留 check:antd 命令入口；antd 已清零，源码与直接依赖均无豁免。
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const ts = require("typescript");
const forbidden = name => /^(antd(?:\/|$)|@ant-design\/)/.test(name);

export function forbiddenImports(source, fileName = "source.tsx") {
  if (!/antd|@ant-design\//.test(source)) return [];
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const results = [];
  const nameOf = node => {
    if (!node) return null;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isTemplateExpression(node)) return node.head.text;
    return null;
  };
  const visit = node => {
    let name;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      name = nameOf(node.moduleSpecifier);
    else if (ts.isExternalModuleReference(node)) name = nameOf(node.expression);
    else if (ts.isModuleDeclaration(node)) name = nameOf(node.name);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    )
      name = nameOf(node.arguments[0]);
    if (name && forbidden(name)) results.push(name);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return [...new Set(results)];
}

export function forbiddenDependencies(manifest) {
  const keys = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  return [...new Set(keys.flatMap(key => Object.keys(manifest[key] ?? {}).filter(forbidden)))];
}

function check() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some(arg => arg !== "--check" && arg !== "--list")) {
    console.error("antd 无存量豁免，仅支持 --check / --list");
    process.exitCode = 1;
    return;
  }
  const skip = new Set([
    "node_modules",
    ".git",
    "dist",
    "dist-electron",
    "output",
    "release",
    ".output",
    ".wxt",
  ]);
  const failures = [];
  const walk = directory => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
        const imports = forbiddenImports(readFileSync(path, "utf8"), path);
        if (imports.length) failures.push(relative(ROOT, path) + ": " + imports.join(", "));
      } else if (entry.name === "package.json") {
        const deps = forbiddenDependencies(JSON.parse(readFileSync(path, "utf8")));
        if (deps.length) failures.push(relative(ROOT, path) + ": " + deps.join(", "));
      }
    }
  };
  walk(join(ROOT, "apps"));
  walk(join(ROOT, "packages"));
  walk(join(ROOT, "examples"));
  for (const name of forbiddenDependencies(
    JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
  ))
    failures.push("package.json: " + name);
  console.log("antd 绝对禁用检查：" + failures.length + " 处违规，无豁免");
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) check();
