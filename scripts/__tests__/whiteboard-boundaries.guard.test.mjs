import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "tau-whiteboard-boundaries-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of ["apps", "examples", "scripts", "packages/whiteboard"])
    mkdirSync(join(directory, name), { recursive: true });
  copyFileSync(
    join(root, "scripts/check-whiteboard-boundaries.mjs"),
    join(directory, "scripts/check-whiteboard-boundaries.mjs")
  );
  copyFileSync(
    join(root, "packages/whiteboard/package.json"),
    join(directory, "packages/whiteboard/package.json")
  );
  const sources = {
    "src/WhiteBoard.tsx": 'export { Board } from "./Board";',
    "src/Board.tsx": [
      'import type { Editor } from "@tau/editor";',
      'import messages from "./locales/fixture.json";',
      "export class Board { label = messages.title; }",
    ].join("\n"),
    "src/index.ts": 'export * from "./WhiteBoard";',
    "contracts.ts": "export interface Contract { id: string; }",
    "src/author.ts": 'export type { BoardElement } from "./types/element";',
    "src/types/element.ts": "export interface BoardElement { id: string; }",
    "src/locales/fixture.json": JSON.stringify({ title: "import('@tau/editor')" }),
    ...overrides,
  };
  for (const [name, source] of Object.entries(sources)) {
    const path = join(directory, "packages/whiteboard", name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  const result = spawnSync(process.execPath, ["scripts/check-whiteboard-boundaries.mjs"], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_PATH: [join(root, "node_modules"), process.env.NODE_PATH]
        .filter(Boolean)
        .join(delimiter),
    },
  });
  assert.ifError(result.error);
  return result;
}

// JSON 词典曾被转译后按 .json 再解析，在 Windows 上触发 TypeScript 路径断言。
test("JSON 词典和纯类型导入不会被当成运行时代码", t => {
  const result = fixture(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Whiteboard 边界通过/);
});

test("核心仍拒绝通过本地模块间接加载编辑器实现", t => {
  const result = fixture(t, {
    "src/Board.tsx": 'export { runtime } from "./runtime";',
    "src/runtime.ts": 'import "@tau/editor"; export const runtime = 1;',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /画布核心不得加载文本或导出实现/);
});

test("核心仍拒绝反向加载扩展装配，路径分隔符不改变边界", t => {
  const result = fixture(t, {
    "src/Board.tsx": 'export { extensions } from "./extensions/builtins";',
    "src/extensions/builtins.tsx": "export const extensions = [];",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /核心不得反向加载扩展装配/);
});

test("作者契约不能通过纯类型导出暴露画布内核", t => {
  const result = fixture(t, {
    "src/Board.tsx": "export class Board {}",
    "src/author.ts": 'export type { Board } from "./Board";',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /白板作者声明依赖内部实现/);
});
