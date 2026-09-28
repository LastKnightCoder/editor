/**
 * 装载守卫（docs/editor-refactor P6.5）：kit 只建一次，宿主扩展没就位就建会静默少块。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type IExtension from "@tau/editor/src/extensions/types";

const extensionOf = (type: string) =>
  ({
    type,
    getPlugins: () => [],
    getHotkeyConfigs: () => [],
    getBlockPanelItems: () => [],
    getHoveringBarElements: () => [],
    render: () => null,
  }) as unknown as IExtension;

vi.mock("@/editor-extensions", () => ({
  createDesktopEditorExtensions: () => [extensionOf("webview")],
}));
vi.mock("../editorRegistry", () => ({ desktopEditorServices: () => {} }));

const typesOf = (kit: { extensions: readonly IExtension[] }) =>
  kit.extensions.map(extension => extension.type);

describe("desktop editor kit", { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("宿主扩展未装载时拒绝建 kit，而不是静默少扩展", async () => {
    const { getDesktopKit } = await import("../editorKit");
    expect(() => getDesktopKit()).toThrow(/宿主扩展尚未装载/);
  });

  it("装载后 kit 含宿主扩展，调用点不必再传", async () => {
    const store = (await import("@/stores/useDynamicExtensionsStore")).default;
    store.setState({
      extensions: [extensionOf("content-link"), extensionOf("whiteboard")],
      initialized: true,
    });
    const { getDesktopKit } = await import("../editorKit");
    expect(typesOf(getDesktopKit())).toEqual(
      expect.arrayContaining(["webview", "content-link", "whiteboard"])
    );
  });
});
