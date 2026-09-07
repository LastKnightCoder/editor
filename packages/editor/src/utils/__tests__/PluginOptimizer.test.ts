import { describe, expect, it } from "vitest";

import type IExtension from "../../extensions/types";
import { PluginOptimizer } from "../PluginOptimizer";

const createExtension = (label: string): IExtension =>
  ({
    type: "same-type",
    getPlugins: () => [],
    render: () => null,
    getHotkeyConfigs: () => [],
    getBlockPanelItems: () => [],
    getHoveringBarElements: () => [],
    label,
  }) as unknown as IExtension;

describe("PluginOptimizer", () => {
  it("不同 Editor 的优化器不会共享同 type 的 renderer", () => {
    const first = createExtension("first");
    const second = createExtension("second");
    const firstOptimizer = new PluginOptimizer();
    const secondOptimizer = new PluginOptimizer();

    firstOptimizer.optimizeExtensions([first]);
    secondOptimizer.optimizeExtensions([second]);

    expect(firstOptimizer.getExtension("same-type")).toBe(first);
    expect(secondOptimizer.getExtension("same-type")).toBe(second);
  });

  it("同一 Editor 内按扩展列表后者覆盖 type", () => {
    const first = createExtension("first");
    const second = createExtension("second");
    const optimizer = new PluginOptimizer();

    optimizer.optimizeExtensions([first, second]);

    expect(optimizer.getExtension("same-type")).toBe(second);
  });
});
