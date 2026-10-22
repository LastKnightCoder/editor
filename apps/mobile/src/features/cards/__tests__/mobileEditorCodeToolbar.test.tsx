import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

/** ActionSheet 替身：同步渲染选项，点击即执行并回调 onClose（真实组件在退场动画后回调） */
vi.mock("../../../components/ActionSheet", () => ({
  ActionSheet: (props: {
    open: boolean;
    title?: string;
    groups?: Array<Array<{ label: string; trailing?: unknown; onClick: () => void }>>;
    onClose: () => void;
  }) =>
    props.open ? (
      <div data-testid="action-sheet" data-title={props.title}>
        {(props.groups ?? []).flat().map(item => (
          <button
            key={item.label}
            type="button"
            data-trailing={typeof item.trailing === "string" ? item.trailing : undefined}
            onClick={() => {
              item.onClick();
              props.onClose();
            }}
          >
            {item.label}
          </button>
        ))}
        <button type="button" onClick={props.onClose}>
          取消
        </button>
      </div>
    ) : null,
}));

const codeBlockInputMocks = vi.hoisted(() => ({
  pressCodeKey: vi.fn(),
  insertCodeText: vi.fn(),
  focusCodeBlockInput: vi.fn(),
}));

vi.mock("../editorToolbar/codeBlockInput", async importOriginal => ({
  ...(await importOriginal<typeof import("../editorToolbar/codeBlockInput")>()),
  ...codeBlockInputMocks,
}));

import {
  MobileEditorBottomToolbar,
  type AccessoryItemId,
} from "../editorToolbar/MobileEditorBottomToolbar";
import type { CodeEditingContext } from "../editorToolbar/editingContext";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import { createControllerStub } from "./toolbarControllerStub";

function getToolbar(): HTMLElement | null {
  return document.querySelector('[data-mobile-editor-toolbar="true"]');
}

function getToolbarButton(label: string): HTMLButtonElement | null {
  return (
    Array.from(getToolbar()?.querySelectorAll("button") ?? []).find(
      button => button.getAttribute("aria-label") === label
    ) ?? null
  );
}

function getToolbarLabels(): string[] {
  return Array.from(getToolbar()?.querySelectorAll("button") ?? []).map(
    button => button.getAttribute("aria-label") ?? button.textContent ?? ""
  );
}

function getSheet(): HTMLElement | null {
  return document.querySelector('[data-testid="action-sheet"]');
}

function getSheetButton(label: string): HTMLButtonElement | undefined {
  return Array.from(getSheet()?.querySelectorAll("button") ?? []).find(
    button => button.textContent === label
  );
}

function dispatch(target: Element | null | undefined, type: string): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  act(() => {
    target?.dispatchEvent(event);
  });
  return event;
}

describe("MobileEditorBottomToolbar 代码块上下文", () => {
  let host: HTMLDivElement;
  let root: Root;
  let textarea: HTMLTextAreaElement;

  const codeContext = (overrides: Partial<CodeEditingContext> = {}): CodeEditingContext => ({
    kind: "code",
    element: { type: "code-block", children: [] } as never,
    path: [2],
    textarea,
    uuid: "code-1",
    language: "ts",
    ...overrides,
  });

  const render = (
    controller: MobileEditorToolbarController,
    visibleButtons?: ReadonlySet<AccessoryItemId>
  ) => {
    act(() => {
      root.render(
        <MobileEditorBottomToolbar controller={controller} visibleButtons={visibleButtons} />
      );
    });
  };

  const codeController = (overrides: Partial<CodeEditingContext> = {}) =>
    createControllerStub({
      isEditorFocused: false,
      isToolbarVisible: true,
      editingContext: codeContext(overrides),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.useRealTimers();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("左端语言标签、中段符号键、右端收起键盘", () => {
    render(codeController());
    expect(getToolbarLabels()).toEqual([
      "代码语言：TypeScript",
      "Tab",
      "(",
      ")",
      "{",
      "}",
      "[",
      "]",
      ";",
      "=",
      '"',
      "'",
      "/",
      "=>",
      "收起键盘",
    ]);
    expect(getToolbarButton("代码语言：TypeScript")?.textContent).toBe("TypeScript");
  });

  it("按语言切换符号键集合，空语言显示「纯文本」", () => {
    render(codeController({ language: "python" }));
    expect(getToolbarLabels().slice(1, -1)).toEqual([
      "Tab",
      "(",
      ")",
      "[",
      "]",
      ":",
      "=",
      '"',
      "'",
      "#",
    ]);

    render(codeController({ language: "md" }));
    expect(getToolbarLabels().slice(1, 4)).toEqual(["#", "*", "`"]);

    render(codeController({ language: "" }));
    expect(getToolbarLabels()[0]).toBe("代码语言：纯文本");
    expect(getToolbarLabels().slice(1, -1)).toEqual([
      "Tab",
      "(",
      ")",
      "{",
      "}",
      "[",
      "]",
      ";",
      "=",
      '"',
      "'",
    ]);
  });

  it("符号键按下阻止默认行为，不抢走 textarea 焦点", () => {
    render(codeController());
    for (const label of ["Tab", "(", "=>", "代码语言：TypeScript", "收起键盘"]) {
      const button = getToolbarButton(label);
      expect(dispatch(button, "pointerdown").defaultPrevented, label).toBe(true);
      expect(dispatch(button, "mousedown").defaultPrevented, label).toBe(true);
      dispatch(button, "pointerup");
    }
  });

  it("单字符键与 Tab 派发按键，多字符键直接插入文本", () => {
    render(codeController());
    act(() => getToolbarButton("(")?.click());
    expect(codeBlockInputMocks.pressCodeKey).toHaveBeenLastCalledWith(textarea, "(");
    act(() => getToolbarButton(";")?.click());
    expect(codeBlockInputMocks.pressCodeKey).toHaveBeenLastCalledWith(textarea, ";");
    act(() => getToolbarButton("Tab")?.click());
    expect(codeBlockInputMocks.pressCodeKey).toHaveBeenLastCalledWith(textarea, "Tab");
    act(() => getToolbarButton("=>")?.click());
    expect(codeBlockInputMocks.insertCodeText).toHaveBeenCalledWith(textarea, "=>");
  });

  it("长按 Tab 450ms 反缩进，松手后的点击不再缩进；短按只缩进", () => {
    render(codeController());
    const tab = getToolbarButton("Tab");

    dispatch(tab, "pointerdown");
    act(() => {
      vi.advanceTimersByTime(449);
    });
    expect(codeBlockInputMocks.pressCodeKey).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(codeBlockInputMocks.pressCodeKey).toHaveBeenCalledWith(textarea, "Tab", {
      shiftKey: true,
    });
    dispatch(tab, "pointerup");
    act(() => tab?.click());
    expect(codeBlockInputMocks.pressCodeKey).toHaveBeenCalledTimes(1);

    dispatch(tab, "pointerdown");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    dispatch(tab, "pointerup");
    act(() => tab?.click());
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(codeBlockInputMocks.pressCodeKey).toHaveBeenCalledTimes(2);
    expect(codeBlockInputMocks.pressCodeKey).toHaveBeenLastCalledWith(textarea, "Tab");
  });

  it("点语言标签打开常用语言，选择后设置语言并在点击内聚焦", () => {
    const controller = codeController();
    render(controller);
    act(() => getToolbarButton("代码语言：TypeScript")?.click());
    expect(getSheet()).toBeNull();
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(getSheet()?.dataset.title).toBe("代码语言");
    expect(getSheetButton("TypeScript")?.dataset.trailing).toBe("当前");
    expect(getSheetButton("更多语言…")).toBeTruthy();
    expect(controller.dismissEditingContext).not.toHaveBeenCalled();

    act(() => getSheetButton("Python")?.click());
    expect(controller.setCodeBlockLanguage).toHaveBeenCalledWith(codeContext(), "Python");
    expect(codeBlockInputMocks.focusCodeBlockInput).toHaveBeenCalledWith(codeContext());
    expect(getSheet()).toBeNull();
  });

  it("「更多语言…」打开完整列表；语言选择期间失焦仍保持代码块配件栏", () => {
    render(codeController());
    act(() => getToolbarButton("代码语言：TypeScript")?.click());
    act(() => {
      vi.runOnlyPendingTimers();
    });

    // textarea 失焦：上下文退回 text、配件栏不再由 controller 要求可见
    const blurredController = createControllerStub({
      isEditorFocused: false,
      isToolbarVisible: false,
    });
    render(blurredController);
    expect(getToolbarButton("代码语言：TypeScript")).toBeTruthy();

    act(() => getSheetButton("更多语言…")?.click());
    expect(getSheet()?.dataset.title).toBe("全部语言");
    expect(codeBlockInputMocks.focusCodeBlockInput).not.toHaveBeenCalled();
    expect(getSheetButton("Kotlin")).toBeTruthy();

    act(() => getSheetButton("Kotlin")?.click());
    expect(blurredController.setCodeBlockLanguage).toHaveBeenCalledWith(codeContext(), "Kotlin");
    expect(codeBlockInputMocks.focusCodeBlockInput).toHaveBeenCalledWith(codeContext());
    expect(getSheet()).toBeNull();
    expect(getToolbar()).toBeNull();
  });

  it("取消语言选择时回到代码块输入框", () => {
    render(codeController());
    act(() => getToolbarButton("代码语言：TypeScript")?.click());
    act(() => {
      vi.runOnlyPendingTimers();
    });
    act(() => getSheetButton("取消")?.click());
    expect(getSheet()).toBeNull();
    expect(codeBlockInputMocks.focusCodeBlockInput).toHaveBeenCalledTimes(1);
  });

  it("收起键盘：textarea 失焦并退出编辑", () => {
    const controller = codeController();
    render(controller);
    textarea.focus();
    expect(document.activeElement).toBe(textarea);
    act(() => getToolbarButton("收起键盘")?.click());
    expect(document.activeElement).not.toBe(textarea);
    expect(controller.exitEditing).toHaveBeenCalled();
  });

  it("面板打开时不显示代码块上下文", () => {
    render(createControllerStub({ editingContext: codeContext(), activePanel: "style" }));
    expect(getToolbarButton("代码语言：TypeScript")).toBeNull();
    expect(getToolbarButton("键盘")).toBeTruthy();
  });
});
