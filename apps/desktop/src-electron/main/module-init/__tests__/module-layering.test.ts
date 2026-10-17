/** 模块只按应用启动阶段分层，不能依赖窗口入口隐式拉起。 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleInitDir = path.resolve(here, "..");
const rendererSrcDir = path.resolve(here, "../../../../src");

const SCAN_EXTENSIONS = [".ts", ".tsx"];

function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSources(full, acc);
    } else if (SCAN_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

// 读源码而非 import：module-config.ts 会连带拉起 50 个模块的重依赖树
function parseModuleConfig(source: string): { name: string; layer: string }[] {
  const entries = source.matchAll(/name:\s*"([^"]+)",\s*layer:\s*InitLayer\.(\w+)/g);
  return [...entries].map(match => ({ name: match[1], layer: match[2] }));
}

function collectGuardedModules(files: string[]): Set<string> {
  const guarded = new Set<string>();
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(/(?:ensureModule|withModule)\(\s*"([^"]+)"/g)) {
      guarded.add(match[1]);
    }
  }
  return guarded;
}

describe("模块分层守护", () => {
  const modules = parseModuleConfig(
    readFileSync(path.join(moduleInitDir, "module-config.ts"), "utf8")
  );

  it("能完整解析模块配置（字段顺序变更会在这里暴露）", () => {
    expect(modules.length).toBeGreaterThanOrEqual(43);
    expect(modules.some(m => m.name === "codex-agent")).toBe(false);
    expect(modules.filter(m => m.layer === "IMMEDIATE").length).toBeGreaterThan(0);
  });

  it("能扫到渲染端兜底调用（防路径失效导致下方断言空过）", () => {
    const guarded = collectGuardedModules(collectSources(rendererSrcDir));
    expect(guarded.has("plugin-local")).toBe(true);
    expect(guarded.has("embedding-model-manager")).toBe(true);
  });

  it("所有模块都属于应用启动层级", () => {
    expect(modules.filter(m => !["IMMEDIATE", "BACKGROUND"].includes(m.layer))).toEqual([]);
  });
});
