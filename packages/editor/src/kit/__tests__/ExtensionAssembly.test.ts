import { describe, expect, it, vi } from "vitest";

import type IExtension from "../../extensions/types";
import { ExtensionAssembly } from "../ExtensionAssembly";
import { fromLegacyExtension } from "../../api/legacy";

const createExtension = (type: string, label: string, plugins: unknown[] = []): IExtension =>
  ({
    type,
    getPlugins: () => plugins,
    render: () => label,
    getHotkeyConfigs: () => [],
    getBlockPanelItems: () => [],
    getHoveringBarElements: () => [],
    label,
  }) as unknown as IExtension;

const renderedBy = (assembly: ExtensionAssembly, type: string) =>
  assembly.render({ element: { type, children: [] }, attributes: {}, children: null } as never);

describe("ExtensionAssembly", () => {
  // 原 PluginOptimizer.test.ts 的用例：不同装配的同 type 分发表必须互不影响
  it("不同装配的同 type 分发互不影响", () => {
    const first = createExtension("same-type", "first");
    const second = createExtension("same-type", "second");

    expect(renderedBy(new ExtensionAssembly([first]), "same-type")).toBe("first");
    expect(renderedBy(new ExtensionAssembly([second]), "same-type")).toBe("second");
  });

  it("列表内同 type 后者生效（kit 只在显式 override 时才会产生这种列表）", () => {
    const first = createExtension("same-type", "first");
    const second = createExtension("same-type", "second");

    expect(renderedBy(new ExtensionAssembly([first, second]), "same-type")).toBe("second");
  });

  it("按顺序收集插件", () => {
    const a = createExtension("a", "a", ["pa"]);
    const b = createExtension("b", "b", ["pb"]);
    expect(new ExtensionAssembly([a, b]).plugins).toEqual(["pa", "pb"]);
  });

  it("单个扩展装配抛错不影响其他扩展", () => {
    const broken = {
      ...createExtension("broken", "broken"),
      getPlugins: () => {
        throw new Error("boom");
      },
    } as unknown as IExtension;
    const healthy = createExtension("healthy", "healthy", ["ok"]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const assembly = new ExtensionAssembly([broken, healthy]);

    expect(assembly.plugins).toEqual(["ok"]);
    expect(assembly.hasElement("healthy")).toBe(true);
    expect(assembly.hasElement("broken")).toBe(false);
    expect(assembly.extensions.map(extension => extension.id)).toContain("broken");
    expect(fromLegacyExtension(healthy)).toBe(fromLegacyExtension(healthy));
    expect(error).toHaveBeenCalled();
  });
});
