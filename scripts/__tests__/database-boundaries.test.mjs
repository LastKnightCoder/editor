import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = resolve(root, "scripts/check-database-boundaries.mjs");
const target = resolve(root, "packages/database/src/DatabaseContext.tsx");
const require = createRequire(resolve(root, "packages/database/package.json"));
const ts = require("typescript");
const source = fs
  .readFileSync(script, "utf8")
  .replaceAll("fileURLToPath(import.meta.url)", JSON.stringify(script));
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

for (const [label, injected] of [
  [
    "namespace 类型访问",
    'import type * as Model from "@tau/shared/database-types"; type Leak = Model.DataTableView;',
  ],
  ["类型重导出", 'export type { DataTableView } from "@tau/shared/database-types";'],
  ["import 类型引用", 'type Leak = import("@tau/shared/database-types").DataTableView;'],
]) {
  test(`门禁拒绝${label}持久化模型`, () => {
    const intercepted = name =>
      name === "node:fs"
        ? {
            ...fs,
            readFileSync(path, ...args) {
              const value = fs.readFileSync(path, ...args);
              return path === target ? value + "\n" + injected : value;
            },
          }
        : require(name);
    assert.throws(
      () => vm.runInNewContext(compiled, { require: intercepted, exports: {}, console }),
      /持久化|DataTableView/
    );
  });
}
