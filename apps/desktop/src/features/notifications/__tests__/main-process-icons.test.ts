// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_ICONS } from "../icons";

/**
 * 主进程 payload.icon 跨 IPC 只传字符串键，组件真源是本端注册表：扫主进程源码里
 * 出现的每个 icon 字符串字面量，断言都已在 NOTIFICATION_ICONS 登记，防止推送出
 * 渲染端画不出图标的卡。
 */

const MAIN_PROCESS_ROOT = fileURLToPath(new URL("../../../../src-electron", import.meta.url));

const ICON_LITERAL = /\bicon:\s*["']([A-Za-z0-9_-]+)["']/g;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function extractIconKeys(sources: Iterable<string>): Set<string> {
  const keys = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(ICON_LITERAL)) keys.add(match[1]!);
  }
  return keys;
}

describe("主进程通知 icon 键与渲染端注册表对账", () => {
  it("src-electron 源码里的 icon 键都在 NOTIFICATION_ICONS 中", () => {
    const sources = listSourceFiles(MAIN_PROCESS_ROOT).map(file => readFileSync(file, "utf-8"));
    const keys = extractIconKeys(sources);
    expect(keys.size, "主进程当前应存在通知 icon 用法（扫描失效时此处归零）").toBeGreaterThan(0);

    const registered = new Set(Object.keys(NOTIFICATION_ICONS));
    const unknown = [...keys].filter(key => !registered.has(key));
    expect(unknown, `未登记的 icon 键：${unknown.join(", ")}`).toEqual([]);
  });

  it("识别未登记键，避免扫描失效导致假通过", () => {
    const keys = extractIconKeys(['routeNotification({ icon: "notRegistered" }, origin)']);
    expect([...keys]).toEqual(["notRegistered"]);
  });
});
