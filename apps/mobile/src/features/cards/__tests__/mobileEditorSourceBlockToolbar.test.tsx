import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PenTool } from "lucide-react";

vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

import {
  MobileEditorBottomToolbar,
  type AccessoryItemId,
} from "../editorToolbar/MobileEditorBottomToolbar";
import type { SourceBlockEditingContext } from "../editorToolbar/editingContext";
import { createControllerStub } from "./toolbarControllerStub";

const sourceBlock = (readOnly = false): SourceBlockEditingContext => ({
  kind: "source-block",
  element: { type: "tikz", content: "", children: [{ type: "formatted", text: "" }] } as never,
  path: [2],
  actions: { title: "TikZ", icon: PenTool, edit: vi.fn(), copySource: vi.fn(), readOnly },
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

describe("配件栏源码块模式", () => {
  let host: HTMLDivElement;
  let root: Root;
  const render = (
    controller: ReturnType<typeof createControllerStub>,
    visibleButtons?: ReadonlySet<AccessoryItemId>
  ) =>
    act(() =>
      root.render(
        <MobileEditorBottomToolbar controller={controller} visibleButtons={visibleButtons} />
      )
    );

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

  it("块登记的名称作标签，中段编辑 / 复制，右端菜单与键盘", () => {
    render(createControllerStub({ isEditorFocused: false, editingContext: sourceBlock() }));
    expect(getChip()).toBe("TikZ");
    expect(getLabels()).toEqual(["编辑", "复制", "TikZ菜单", "键盘"]);
  });

  it("编辑与复制调用块登记的动作，键盘把光标放到块后", () => {
    const context = sourceBlock();
    const controller = createControllerStub({ isEditorFocused: false, editingContext: context });
    render(controller);
    press("编辑");
    expect(context.actions.edit).toHaveBeenCalledTimes(1);
    press("复制");
    expect(context.actions.copySource).toHaveBeenCalledTimes(1);
    press("键盘");
    expect(controller.focusAfterVoid).toHaveBeenCalledWith(expect.any(Function));
  });

  it("不可编辑的块没有编辑入口，菜单里也没有删除", () => {
    vi.useFakeTimers();
    try {
      render(createControllerStub({ isEditorFocused: false, editingContext: sourceBlock(true) }));
      expect(getLabels()).toEqual(["复制", "TikZ菜单", "键盘"]);
      press("TikZ菜单");
      act(() => vi.runAllTimers());
      const text = document.body.textContent ?? "";
      expect(text).toContain("块操作");
      expect(text).not.toContain("删除TikZ");
    } finally {
      vi.useRealTimers();
    }
  });

  it("菜单在下一拍打开动作面板，列出块操作与删除", () => {
    vi.useFakeTimers();
    try {
      render(createControllerStub({ isEditorFocused: false, editingContext: sourceBlock() }));
      press("TikZ菜单");
      act(() => vi.runAllTimers());
      const text = document.body.textContent ?? "";
      for (const label of ["块操作", "删除TikZ"]) expect(text, label).toContain(label);
    } finally {
      vi.useRealTimers();
    }
  });

  it("白名单未列入源码块时按通用模式渲染；面板打开时让位", () => {
    render(
      createControllerStub({ isEditorFocused: false, editingContext: sourceBlock() }),
      new Set<AccessoryItemId>(["undo"])
    );
    expect(getChip()).toBeUndefined();
    expect(getLabels()).not.toContain("编辑");

    render(createControllerStub({ editingContext: sourceBlock(), activePanel: "style" }));
    expect(getLabels()).not.toContain("TikZ菜单");
  });
});
