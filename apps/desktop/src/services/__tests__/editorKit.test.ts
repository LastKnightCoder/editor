/**
 * kit 的两档扩展边界（docs/editor-refactor P6.5）。
 * 重点是文件档不含白板 / 数据库——这两种块在 Markdown 里没有对应语法，
 * 给了插入入口就会让用户插进去、保存回 .md 时丢内容。
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

  it("库内内容的 kit 含白板与数据库块，Markdown 文件的 kit 不含", async () => {
    const store = (await import("@/stores/useDynamicExtensionsStore")).default;
    store.setState({
      extensions: [extensionOf("content-link")],
      libraryBlockExtensions: [extensionOf("whiteboard"), extensionOf("database")],
      initialized: true,
    });
    const { getDesktopKit, getDesktopFileKit } = await import("../editorKit");

    expect(typesOf(getDesktopKit())).toEqual(
      expect.arrayContaining(["webview", "content-link", "whiteboard", "database"])
    );

    const fileTypes = typesOf(getDesktopFileKit());
    expect(fileTypes).toEqual(expect.arrayContaining(["webview", "content-link"]));
    expect(fileTypes).not.toContain("whiteboard");
    expect(fileTypes).not.toContain("database");
  });
});
