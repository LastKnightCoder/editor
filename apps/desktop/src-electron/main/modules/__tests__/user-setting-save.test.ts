/**
 * 设置落盘的并发安全（事故修复）：多窗口同时改设置时，共用固定 tmp 路径的并发写会互相截断，
 * 产出「完整 JSON + 旧内容尾巴」的坏文件，并伴随大量 rename ENOENT。
 * 这里覆盖抢救函数：坏文件必须能取回开头那个完整对象，而不是被当成空设置清空用户配置。
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import PathUtil from "../../utils/PathUtil";
import settings, { salvageLeadingJsonObject } from "../user-setting";

describe("损坏设置文件的抢救", () => {
  it("并发写残留（完整 JSON + 旧尾巴）能取回完整对象", () => {
    const good = JSON.stringify({ a: 1, nested: { b: "x" }, layout: "shortSidebar" }, null, 2);
    const corrupt = `${good}nableReranker": false,\n    "devicePolicy": "auto"\n  }\n}`;
    expect(JSON.parse.bind(null, corrupt)).toThrow();
    expect(salvageLeadingJsonObject(corrupt)).toEqual({
      a: 1,
      nested: { b: "x" },
      layout: "shortSidebar",
    });
  });

  it("字符串里的括号与转义不影响边界判定", () => {
    const good = JSON.stringify({ tricky: '} { "not": "json" \\" }', ok: true });
    expect(salvageLeadingJsonObject(`${good}垃圾尾巴{`)).toEqual({
      tricky: '} { "not": "json" \\" }',
      ok: true,
    });
  });

  it("完好文件原样返回", () => {
    expect(salvageLeadingJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("开头就残缺时返回 null，交由调用方保留备份而不是猜", () => {
    expect(salvageLeadingJsonObject('{"a": 1, "b": {"c"')).toBeNull();
    expect(salvageLeadingJsonObject("")).toBeNull();
    expect(salvageLeadingJsonObject("[1,2]")).toBeNull();
  });
});

it("首次启动将关闭渐变背景的选择写入设置文件", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tau-user-setting-"));
  const appDir = vi.spyOn(PathUtil, "getAppDir").mockReturnValue(dir);
  try {
    const snapshot = await settings.getSettingSnapshot();
    const persisted = JSON.parse(await readFile(join(dir, "setting.json"), "utf-8"));
    expect(snapshot.appearance.backdrop.enabled).toBe(false);
    expect(persisted.appearance.backdrop.enabled).toBe(false);
  } finally {
    appDir.mockRestore();
    await rm(dir, { recursive: true, force: true });
  }
});
