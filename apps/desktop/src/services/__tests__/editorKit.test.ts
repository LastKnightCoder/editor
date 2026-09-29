/**
 * 场景 kit 的扩展集基线（docs/editor-refactor P6.6、ER-016 / ER-017）。
 *
 * 这些断言就是「哪个场景该有什么能力」的唯一可执行记录：改动任何一个 kit 的扩展集都会让
 * 这里失败，迫使改动者说明理由。P6.5 曾在没有这层守护时静默改掉 36 个调用点的扩展集。
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

/** desktop 静态扩展（markdown 粘贴导入、webview、图片覆盖）在此用 webview 一个哨兵代表 */
vi.mock("@/editor-extensions", () => ({
  createDesktopEditorExtensions: () => [extensionOf("webview")],
  fileAttachmentExtension: extensionOf("file-attachment"),
}));
vi.mock("@/editor-extensions/flashcard-blank", () => ({
  default: class {
    type = "flashcard-blank";
    getPlugins = () => [];
    getHotkeyConfigs = () => [];
    getBlockPanelItems = () => [];
    getHoveringBarElements = () => [];
    render = () => null;
  },
}));
vi.mock("../editorRegistry", () => ({ desktopEditorServices: () => {} }));

const HOST = ["content-link", "file-attachment", "inline-ai-assistant", "whiteboard", "database"];
const TRACKED = new Set([...HOST, "webview", "flashcard-blank"]);

const loadStore = async () => {
  const store = (await import("@/stores/useDynamicExtensionsStore")).default;
  store.setState({ extensions: HOST.map(extensionOf), initialized: true });
};

/** 只看非内置的 type：内置扩展由内核补齐，不是场景差异所在 */
const extrasOf = (kit: { extensions: readonly IExtension[] }) =>
  kit.extensions
    .map(extension => extension.type)
    .filter(type => TRACKED.has(type))
    .sort();

describe("desktop 场景 kit", { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("宿主扩展未装载时拒绝建 kit，而不是静默少扩展", async () => {
    const { getContentKit } = await import("../editorKit");
    expect(() => getContentKit()).toThrow(/宿主扩展尚未装载/);
  });

  it("content 正文：底座 + 全部宿主扩展", async () => {
    await loadStore();
    const { getContentKit } = await import("../editorKit");
    expect(extrasOf(getContentKit())).toEqual([...HOST, "webview"].sort());
  });

  it("content 正文覆盖跨端清单里的全部业务元素类型", async () => {
    await loadStore();
    const { CONTENT_ELEMENT_TYPES } = await import("@tau/shared");
    const { getContentKit } = await import("../editorKit");
    const types = getContentKit().extensions.map(extension => extension.type);
    for (const required of CONTENT_ELEMENT_TYPES) {
      expect(types, `content 正文缺少 ${required}，该类型的块只会显示通用占位`).toContain(required);
    }
  });

  it("简短描述输入：只有底座，不含任何content 专属块", async () => {
    await loadStore();
    const { getDescriptionKit } = await import("../editorKit");
    expect(extrasOf(getDescriptionKit())).toEqual(["webview"]);
  });

  it("Markdown 文件：底座 + 附件，不含白板与数据库（存不回 .md）", async () => {
    await loadStore();
    const { getMarkdownFileKit } = await import("../editorKit");
    expect(extrasOf(getMarkdownFileKit())).toEqual(["file-attachment", "webview"]);
  });

  it("skill 文件：只有底座（历来不装附件）", async () => {
    await loadStore();
    const { getSkillFileKit } = await import("../editorKit");
    expect(extrasOf(getSkillFileKit())).toEqual(["webview"]);
  });

  it("闪卡：底座 + 填空；blanks: false 时不装填空", async () => {
    await loadStore();
    const { getFlashcardKit } = await import("../editorKit");
    expect(extrasOf(getFlashcardKit())).toEqual(["flashcard-blank", "webview"]);
    expect(extrasOf(getFlashcardKit({ blanks: false }))).toEqual(["webview"]);
  });

  it("白板箭头描述：比内置更少，只有段落 / 行内公式 / 链接", async () => {
    await loadStore();
    const { getArrowLabelKit } = await import("../editorKit");
    expect(
      getArrowLabelKit()
        .extensions.map(extension => extension.type)
        .sort()
    ).toEqual(["inline-math", "link", "paragraph"]);
  });

  it("同一场景反复取到同一个 kit 实例（否则编辑器会被重建）", async () => {
    await loadStore();
    const { getContentKit, getDescriptionKit } = await import("../editorKit");
    expect(getContentKit()).toBe(getContentKit());
    expect(getDescriptionKit()).not.toBe(getContentKit());
  });
});
