import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { qualityCases } from "./fixtures/quality-cases.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

function runTool(tool, args, cwd, input) {
  const manifest = require.resolve(`${tool}/package.json`);
  const { bin } = JSON.parse(readFileSync(manifest, "utf8"));
  return spawnSync(process.execPath, [resolve(dirname(manifest), bin[tool]), ...args], {
    cwd,
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function createWorkspace() {
  const directory = mkdtempSync(resolve(tmpdir(), "tau-quality-test-"));
  symlinkSync(resolve(root, "node_modules"), resolve(directory, "node_modules"), "junction");
  for (const name of [".oxlintrc.json", ".oxfmtrc.json"]) {
    writeFileSync(resolve(directory, name), readFileSync(resolve(root, name)));
  }
  return directory;
}

test("架构规则、豁免路径与行内禁用保持有效", async t => {
  const directory = createWorkspace();
  try {
    for (const item of qualityCases) {
      const file = resolve(directory, item.file);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, item.source);
    }
    const result = runTool(
      "oxlint",
      ["--format", "json", ...qualityCases.map(item => item.file)],
      directory
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
    const { diagnostics, number_of_files } = JSON.parse(result.stdout);
    assert.equal(number_of_files, qualityCases.length);
    for (const item of qualityCases) {
      await t.test(item.name, () => {
        const messages = diagnostics.filter(
          diagnostic =>
            diagnostic.filename === item.file && diagnostic.code.endsWith(`(${item.rule})`)
        );
        assert.equal(messages.length, item.count, JSON.stringify(messages));
      });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("格式化保留基础风格、Tailwind 排序与宣传片宽行", () => {
  const directory = createWorkspace();
  try {
    const source =
      'export const value = { name: "测试", list: [1, 2, 3] };\nexport const double = value => value * 2;\n';
    const basic = runTool(
      "oxfmt",
      ["--stdin-filepath", "packages/ui/src/quality.ts"],
      directory,
      source
    );
    assert.equal(basic.status, 0, basic.stderr);
    assert.equal(basic.stdout, source);
    const tailwind = runTool(
      "oxfmt",
      ["--stdin-filepath", "packages/ui/src/quality.tsx"],
      directory,
      'export const element = <div className="p-4 flex text-center" />;\n'
    );
    assert.equal(tailwind.status, 0, tailwind.stderr);
    assert.match(tailwind.stdout, /className="flex p-4 text-center"/);
    const wide = `export const sentence = makeSentence("${"长文本".repeat(15)}", "第二个参数", "第三个参数");\n`;
    const normal = runTool(
      "oxfmt",
      ["--stdin-filepath", "packages/ui/src/quality.ts"],
      directory,
      wide
    );
    const promo = runTool(
      "oxfmt",
      ["--stdin-filepath", "apps/promo-video/src/quality.ts"],
      directory,
      wide
    );
    assert.equal(normal.status, 0, normal.stderr);
    assert.equal(promo.status, 0, promo.stderr);
    assert.ok(normal.stdout.split("\n").length > promo.stdout.split("\n").length);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("格式化不会改写发布快照、Markdown 夹具和构建产物", () => {
  const directory = createWorkspace();
  try {
    const files = [
      "tests/fixtures/plugins/releases/plugin/index.ts",
      "packages/markdown/src/__fixtures__/roundtrip.md",
      "apps/desktop/dist/generated.ts",
      "apps/desktop/vendor/library.ts",
      "pnpm-lock.yaml",
    ];
    for (const file of files) {
      const target = resolve(directory, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, "保留原始字节\r\n");
    }
    const result = runTool(
      "oxfmt",
      ["--write", "--no-error-on-unmatched-pattern", ...files],
      directory
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    for (const file of files)
      assert.equal(readFileSync(resolve(directory, file), "utf8"), "保留原始字节\r\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("从子包执行时仍加载根配置和目录覆盖", () => {
  const directory = createWorkspace();
  try {
    const database = resolve(directory, "packages/database");
    mkdirSync(resolve(database, "src"), { recursive: true });
    writeFileSync(resolve(database, "src/quality.ts"), 'import { value } from "@/commands/card";');
    const lint = runTool("oxlint", ["--format", "json", "src"], database);
    assert.equal(lint.status, 1, lint.stderr || lint.stdout);
    assert.ok(
      JSON.parse(lint.stdout).diagnostics.some(item =>
        item.code.endsWith("(no-restricted-imports)")
      )
    );

    const promo = resolve(directory, "apps/promo-video");
    mkdirSync(promo, { recursive: true });
    const source = `export const sentence = makeSentence("${"长文本".repeat(15)}", "第二个参数", "第三个参数");\n`;
    const format = runTool("oxfmt", ["--stdin-filepath", "src/quality.ts"], promo, source);
    assert.equal(format.status, 0, format.stderr);
    assert.equal(format.stdout, source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("质量命令检查显式 data 路径、含空格文件名与不存在的文件", () => {
  const directory = createWorkspace();
  const run = (mode, file) =>
    spawnSync(process.execPath, [resolve(root, "scripts/quality.mjs"), mode, file], {
      cwd: directory,
      encoding: "utf8",
    });
  try {
    const file = "apps/mobile/src/features/plugins/data/quality with spaces.ts";
    mkdirSync(dirname(resolve(directory, file)), { recursive: true });
    writeFileSync(resolve(directory, file), 'import { value } from "@tau/editor/src/private";');
    const lint = run("lint", file);
    assert.equal(lint.status, 1, lint.stderr || lint.stdout);
    assert.match(lint.stdout + lint.stderr, /no-restricted-imports/);

    const ignored = "apps/desktop/dist/generated.ts";
    mkdirSync(dirname(resolve(directory, ignored)), { recursive: true });
    writeFileSync(resolve(directory, ignored), "不应解析的生成内容");
    assert.equal(run("lint", ignored).status, 0);
    assert.equal(run("format:check", ignored).status, 0);

    const missing = run("lint", "missing.ts");
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /文件不存在/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
