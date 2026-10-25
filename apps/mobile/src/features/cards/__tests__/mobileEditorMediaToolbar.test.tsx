import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

const keyboardViewportState = vi.hoisted(() => ({
  viewportHeight: 760,
  keyboardHeight: 0,
  isKeyboardVisible: false,
  rawKeyboardHeight: 0,
  reservedHeight: 0,
  lastKeyboardHeight: 300,
}));

vi.mock("../../../components/KeyboardViewportProvider", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../components/KeyboardViewportProvider")>()),
  useKeyboardViewport: () => keyboardViewportState,
}));

import { MobileEditorBottomToolbar } from "../editorToolbar/MobileEditorBottomToolbar";
import type { MediaEditingContext } from "../editorToolbar/editingContext";
import { createControllerStub } from "./toolbarControllerStub";

const mediaContext = (
  mediaType: MediaEditingContext["mediaType"],
  extra: Partial<MediaEditingContext> = {}
): MediaEditingContext => ({
  kind: "media",
  mediaType,
  element: { type: mediaType, children: [{ type: "formatted", text: "" }] } as never,
  path: [0],
  captionEditing: false,
  ...extra,
});

const getToolbar = () => document.querySelector('[data-mobile-editor-toolbar="true"]');
const getLabels = () =>
  Array.from(getToolbar()?.querySelectorAll("button") ?? []).map(
    button => button.getAttribute("aria-label") ?? ""
  );
const getChip = () => getToolbar()?.querySelector("[data-context-chip]")?.textContent;
const press = (label: string) => {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button, label).toBeTruthy();
  act(() => button?.click());
};

describe("配件栏媒体模式", () => {
  let host: HTMLDivElement;
  let root: Root;
  const render = (controller: ReturnType<typeof createControllerStub>) =>
    act(() => root.render(<MobileEditorBottomToolbar controller={controller} />));

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("图片：类型标签 + 尺寸 / 对齐 / 裁剪 / 说明 / 替换，右端菜单与键盘", () => {
    render(createControllerStub({ isEditorFocused: false, editingContext: mediaContext("image") }));
    expect(getChip()).toBe("图片");
    expect(getLabels()).toEqual(["尺寸", "对齐", "裁剪", "说明", "替换", "图片菜单", "键盘"]);
  });

  it("尺寸打开媒体面板、再点关闭且不弹键盘；键盘按钮把光标放到媒体后", () => {
    const controller = createControllerStub({
      isEditorFocused: false,
      editingContext: mediaContext("image"),
    });
    render(controller);
    press("尺寸");
    expect(controller.openPanel).toHaveBeenCalledWith("media", expect.any(Number));
    press("键盘");
    expect(controller.focusAfterVoid).toHaveBeenCalledWith(expect.any(Function));

    const opened = createControllerStub({
      isEditorFocused: false,
      activePanel: "media",
      editingContext: mediaContext("image"),
    });
    render(opened);
    expect(document.querySelector('[data-media-panel="image"]')).toBeTruthy();
    press("尺寸");
    expect(opened.closePanel).toHaveBeenCalledWith({ showKeyboard: false });
  });

  it("各媒体类型的中段按钮", () => {
    const cases: Array<[MediaEditingContext["mediaType"], string[]]> = [
      ["video", ["尺寸", "对齐", "替换", "视频菜单", "键盘"]],
      ["audio", ["重命名", "替换", "音频菜单", "键盘"]],
      ["inline-image", ["小尺寸", "中尺寸", "大尺寸", "查看", "转为大图", "删除行内图片", "键盘"]],
      ["webview", ["地址", "高度", "刷新", "全屏", "网页菜单", "键盘"]],
    ];
    for (const [mediaType, labels] of cases) {
      render(
        createControllerStub({ isEditorFocused: false, editingContext: mediaContext(mediaType) })
      );
      expect(getLabels(), mediaType).toEqual(labels);
    }
  });

  it("图片说明编辑中只留「完成」", () => {
    render(
      createControllerStub({
        isEditorFocused: false,
        editingContext: mediaContext("image", { captionEditing: true }),
      })
    );
    expect(getChip()).toBe("图片说明");
    expect(getLabels()).toEqual(["完成"]);
  });

  it("菜单在下一拍打开动作面板，列出图片的低频操作", () => {
    vi.useFakeTimers();
    try {
      render(
        createControllerStub({ isEditorFocused: false, editingContext: mediaContext("image") })
      );
      press("图片菜单");
      act(() => vi.runAllTimers());
      const text = document.body.textContent ?? "";
      for (const label of ["查看大图", "替代文本", "复制图片", "块操作", "删除图片"]) {
        expect(text, label).toContain(label);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
