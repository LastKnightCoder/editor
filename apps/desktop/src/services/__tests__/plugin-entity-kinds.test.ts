import { describe, expect, it, vi } from "vitest";
import {
  isMentionableResult,
  pluginEntityKind,
  registerPluginEntityKind,
} from "../plugin-entity-kinds";

const entry = (mentionable: boolean) => ({
  pluginId: "tau.weekly-review",
  kind: "note",
  label: "周记",
  mentionable,
  open: vi.fn(),
});

describe("插件内容类型登记", () => {
  it("@ 面板只收录正在运行且声明可引用的插件内容", () => {
    const result = {
      type: "plugin-entity",
      pluginEntity: { pluginId: "tau.weekly-review", kind: "note" },
    };
    expect(isMentionableResult({ type: "card" })).toBe(true);
    expect(isMentionableResult(result)).toBe(false);

    const quiet = registerPluginEntityKind(entry(false));
    expect(isMentionableResult(result)).toBe(false);
    quiet();

    const dispose = registerPluginEntityKind(entry(true));
    expect(isMentionableResult(result)).toBe(true);
    expect(isMentionableResult({ type: "plugin-entity" })).toBe(false);
    dispose();
    expect(pluginEntityKind("tau.weekly-review", "note")).toBeUndefined();
    expect(isMentionableResult(result)).toBe(false);
  });

  it("旧的注销句柄不撤销新登记", () => {
    const first = registerPluginEntityKind(entry(true));
    const second = entry(false);
    const disposeSecond = registerPluginEntityKind(second);
    first();
    expect(pluginEntityKind("tau.weekly-review", "note")).toBe(second);
    disposeSecond();
  });
});
