import { act, type ReactNode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorRef } from "@tau/editor";
import { Node as SlateNode, createEditor, type Descendant, type Editor, type Range } from "slate";

const tauriMock = vi.hoisted(() => ({ createQuickCard: vi.fn() }));
vi.mock("../../../../services/tauri", () => tauriMock);
const navigatorMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("../../../../router", () => ({ getNavigator: () => navigatorMock }));

import { AppContext, type AppContextValue } from "../../../../app/AppContext";
import { toastQueue } from "../../../../components/toast";
import { getContentLength } from "../../editorContentUtils";
import { createControllerStub } from "../../__tests__/toolbarControllerStub";
import type { MobileEditorToolbarController } from "../../editorToolbar/useMobileEditorToolbarController";
import { ReadingSelectionBar } from "../ReadingSelectionBar";
import type { ReadingModeState } from "../useReadingMode";

const RANGE: Range = {
  anchor: { path: [0, 0], offset: 0 },
  focus: { path: [0, 0], offset: 5 },
};

const EXCERPT = [
  { type: "paragraph", children: [{ type: "formatted", text: "hello" }] },
] as unknown as Descendant[];

function createDocEditor(): Editor {
  const editor = createEditor();
  editor.children = [
    { type: "paragraph", children: [{ type: "formatted", text: "hello world" }] },
  ] as unknown as Descendant[];
  return editor;
}

function createReadingModeStub(overrides: Partial<ReadingModeState> = {}): ReadingModeState {
  return {
    editing: false,
    canEdit: true,
    enterEditing: vi.fn(),
    enterEditingWithSelection: vi.fn(),
    exitEditing: vi.fn(),
    readingSurfaceProps: { onPointerUp: vi.fn(), onClickCapture: vi.fn() },
    ...overrides,
  };
}

describe("ReadingSelectionBar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    tauriMock.createQuickCard.mockReset();
    navigatorMock.push.mockReset();
    toastQueue.clearAll();
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function setup(
    options: {
      readingMode?: ReadingModeState;
      range?: Range | null;
      wrap?: (node: ReactNode) => ReactNode;
      onAsk?: (quote: string) => void;
    } = {}
  ) {
    const editor = createDocEditor();
    const editorRef: RefObject<EditorRef | null> = {
      current: {
        focus: vi.fn(),
        deselect: vi.fn(),
        getEditor: () => editor,
        getEditableElement: () => null,
        isFocus: () => false,
      },
    };
    const controller: MobileEditorToolbarController = createControllerStub();
    const readingMode = options.readingMode ?? createReadingModeStub();
    const onClear = vi.fn();
    const render = (range: Range | null = options.range === undefined ? RANGE : options.range) => {
      const node = (
        <ReadingSelectionBar
          editorRef={editorRef}
          controller={controller}
          readingMode={readingMode}
          range={range}
          onClear={onClear}
          onAsk={options.onAsk}
          portalContainer={host}
        />
      );
      act(() => root.render(options.wrap ? options.wrap(node) : node));
    };
    render();
    return { editor, controller, readingMode, onClear, render };
  }

  function button(label: string): HTMLButtonElement {
    const found = [...host.querySelectorAll("button")].find(item => item.textContent === label);
    if (!found) throw new Error(`未找到 ${label}`);
    return found;
  }

  const bar = () => host.querySelector('[data-reading-selection-bar="true"]');

  it("有选区显示四个按钮；按下按钮阻止默认行为以保留 DOM 选区", () => {
    setup();
    expect(bar()).not.toBeNull();
    expect([...host.querySelectorAll("button")].map(item => item.textContent)).toEqual([
      "高亮",
      "批注",
      "摘录成卡片",
      "引用内容",
    ]);
    const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    button("高亮").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("就近提问：传入 onAsk 时最前面多出「问 AI」，交出选中原文并清空选区", () => {
    const onAsk = vi.fn();
    const { onClear, readingMode } = setup({
      onAsk,
      range: { anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 4 } },
    });
    expect(host.querySelector("button")?.textContent).toBe("问 AI");
    act(() => button("问 AI").click());
    expect(onAsk).toHaveBeenCalledWith("ell");
    expect(onClear).toHaveBeenCalled();
    expect(readingMode.enterEditingWithSelection).not.toHaveBeenCalled();
  });

  it("无选区、不可编辑或编辑中不显示", () => {
    setup({ range: null });
    expect(bar()).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    setup({ readingMode: createReadingModeStub({ canEdit: false }) });
    expect(bar()).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    setup({ readingMode: createReadingModeStub({ editing: true }) });
    expect(bar()).toBeNull();
  });

  it("高亮写入 marks 且不进入编辑；已整体高亮时显示「取消高亮」并移除", () => {
    const { editor, onClear, readingMode, render } = setup();
    act(() => button("高亮").click());
    expect(SlateNode.get(editor, [0, 0])).toMatchObject({ text: "hello", highlight: "yellow" });
    expect(SlateNode.get(editor, [0, 1])).not.toHaveProperty("highlight");
    expect(editor.selection).toBeNull();
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(readingMode.enterEditingWithSelection).not.toHaveBeenCalled();

    render({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 5 } });
    act(() => button("取消高亮").click());
    expect(SlateNode.get(editor, [0, 0])).not.toHaveProperty("highlight");
    expect(editor.selection).toBeNull();
  });

  it("部分高亮时仍为「高亮」", () => {
    const { editor, render } = setup({
      range: { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 2 } },
    });
    act(() => button("高亮").click());
    render({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 1], offset: 3 } });
    expect(SlateNode.get(editor, [0, 0])).toMatchObject({ highlight: "yellow" });
    expect(button("高亮")).toBeTruthy();
  });

  it.each([
    ["批注", "comment"],
    ["引用内容", "content-link"],
  ])("%s：进入编辑选中 range 后执行 %s", (label, actionId) => {
    const { controller, readingMode } = setup();
    const calls: string[] = [];
    vi.mocked(readingMode.enterEditingWithSelection).mockImplementation(() => {
      calls.push("enter");
    });
    vi.mocked(controller.executeAction).mockImplementation(() => {
      calls.push("execute");
    });
    act(() => button(label).click());
    expect(readingMode.enterEditingWithSelection).toHaveBeenCalledWith(RANGE);
    expect(controller.executeAction).toHaveBeenCalledWith(actionId);
    expect(calls).toEqual(["enter", "execute"]);
  });

  it("摘录成卡片：以选中片段建卡、刷新列表、toast 带「查看」", async () => {
    tauriMock.createQuickCard.mockResolvedValue({ id: 42, contentId: 7 });
    const refreshCardsSafe = vi.fn(async () => null);
    const app = { refreshCardsSafe } as unknown as AppContextValue;
    const { onClear, readingMode } = setup({
      wrap: node => <AppContext.Provider value={app}>{node}</AppContext.Provider>,
    });
    await act(async () => button("摘录成卡片").click());

    expect(tauriMock.createQuickCard).toHaveBeenCalledWith({
      content: EXCERPT,
      contracts: undefined,
      count: getContentLength(EXCERPT),
    });
    expect(onClear).toHaveBeenCalled();
    expect(readingMode.enterEditingWithSelection).not.toHaveBeenCalled();
    expect(refreshCardsSafe).toHaveBeenCalledWith({ page: 1 });
    const [toastItem] = toastQueue.list();
    expect(toastItem).toMatchObject({ type: "success", text: "已摘录为卡片" });
    toastItem.action?.onClick();
    expect(navigatorMock.push).toHaveBeenCalledWith("contentDetail", { cardId: 42 });
  });

  it("摘录失败提示错误", async () => {
    tauriMock.createQuickCard.mockRejectedValue(new Error("boom"));
    setup();
    await act(async () => button("摘录成卡片").click());
    const [toastItem] = toastQueue.list();
    expect(toastItem?.type).toBe("error");
  });

  it("选区失效（文档已变）时不显示", () => {
    const { editor, onClear, readingMode } = setup({
      range: { anchor: { path: [3, 0], offset: 0 }, focus: { path: [3, 0], offset: 2 } },
    });
    expect(bar()).toBeNull();
    expect(onClear).not.toHaveBeenCalled();
    expect(readingMode.enterEditingWithSelection).not.toHaveBeenCalled();
    expect(editor.selection).toBeNull();
  });
});
