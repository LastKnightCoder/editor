/**
 * 模块分层守护 —— 防止「按需加载」重新退化成隐式契约。
 *
 * 背景：ON_DEMAND 层模块原先只由 `initModulesForWindow`（窗口类型 → 模块组）拉起，
 * 新壳层 AppShell 不经该入口，导致 39 个模块的 handler 从未注册（updater:check 报
 * "No handler registered"）。现统一为 BACKGROUND，随应用启动初始化，不依赖调用方。
 * 若确需新增按需模块，必须在渲染端用 ensureModule/withModule 接入兜底，否则本测试失败。
 */
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
  const entries = source.matchAll(
    /name:\s*"([^"]+)",\s*group:\s*ModuleGroup\.\w+,\s*layer:\s*InitLayer\.(\w+)/g
  );
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
    expect(modules.length).toBeGreaterThanOrEqual(50);
    expect(modules.filter(m => m.layer === "IMMEDIATE").length).toBeGreaterThan(0);
  });

  it("能扫到渲染端兜底调用（防路径失效导致下方断言空过）", () => {
    const guarded = collectGuardedModules(collectSources(rendererSrcDir));
    expect(guarded.has("weread")).toBe(true);
    expect(guarded.has("terminal")).toBe(true);
    expect(guarded.has("embedding-model-manager")).toBe(true);
  });

  it("按需模块必须接入渲染端 ensureModule/withModule 兜底", () => {
    const guarded = collectGuardedModules(collectSources(rendererSrcDir));
    const uncovered = modules
      .filter(m => m.layer === "ON_DEMAND")
      .filter(m => !guarded.has(m.name))
      .map(m => m.name);

    expect(
      uncovered,
      "以下模块标为 ON_DEMAND 但没有调用方，其 IPC handler 不会注册：" +
        "请改为 BACKGROUND，或在渲染端用 ensureModule/withModule 接入兜底"
    ).toEqual([]);
  });
});
