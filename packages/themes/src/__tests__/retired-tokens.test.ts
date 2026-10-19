import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 已退役的 token 不许回流（D-034）：bg-group 夹在 page 与 surface 之间读不出层级，
 * 替代口径——hover 填充用 bg-hover，静态容器用 surface + line-1 描边，轨道用 bg-track。
 * 扫 themes / ui / desktop / editor 四处源码。
 */
const RETIRED = /\bbg-group\b|--tau-bg-group|--color-group\b/;
const ROOTS = ["..", "../../../ui/src", "../../../../apps/desktop/src", "../../../editor/src/core"].map(
  p => resolve(import.meta.dirname, p)
);
const EXT = /\.(tsx?|css)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

describe("退役 token 不回流", () => {
  it("源码中不再出现 bg-group", () => {
    const hits = ROOTS.flatMap(root => walk(root)).flatMap(file =>
      readFileSync(file, "utf-8")
        .split("\n")
        .map((line, i) => (RETIRED.test(line) ? `${file}:${i + 1}` : null))
        .filter((s): s is string => s !== null)
    );
    expect(hits, `发现已退役的 bg-group：\n${hits.join("\n")}`).toEqual([]);
  });
});
