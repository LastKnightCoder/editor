import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (["__tests__", "eval", "node_modules"].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sources(path)
      : /\.[cm]?tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)
        ? [path]
        : [];
  });
}

it("产品代码只在公共请求模块装配底层模型协议", () => {
  const directories = [
    "packages/ai/src",
    "apps/desktop/src",
    "apps/desktop/src-electron/main",
    "apps/mobile/src",
  ];
  const violations: string[] = [];
  for (const directory of directories) {
    const files = sources(resolve(root, directory));
    expect(files.length, `扫描目录非空：${directory}`).toBeGreaterThan(0);
    for (const path of files) {
      const name = relative(root, path);
      if (name === "packages/ai/src/model-request.ts") continue;
      const source = readFileSync(path, "utf8");
      if (
        /from\s+["']@earendil-works\/pi-ai\/(?:api\/|compat["'])/.test(source) ||
        /\b(?:models|modelRuntime)\.streamSimple\(/.test(source)
      )
        violations.push(name);
    }
  }
  expect(violations).toEqual([]);
});
