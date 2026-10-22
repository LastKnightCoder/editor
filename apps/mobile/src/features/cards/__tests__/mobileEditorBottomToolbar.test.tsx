import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tau/editor/toolbar", () => ({
  calculateFloatingPosition: () => ({
    left: 8,
    top: 8,
    placement: "top",
  }),
}));

vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("../../../components/ActionSheet", () => ({
  __esModule: true,
  default: ({
    open,
    groups,
  }: {
    open: boolean;
    groups?: Array<Array<{ label: string; onClick: () => void }>>;
  }) =>
    open ? (
      <div data-testid="insert-sheet">
        {(groups ?? []).flat().map(item => (
          <button key={item.label} type="button" onClick={item.onClick}>
            {item.label}
          </button>
        ))}
      </div>
    ) : null,
}));

vi.mock("../../../hooks/useKeyboardViewport", () => ({
  useKeyboardViewportState: () => ({
    viewportHeight: 844,
    keyboardHeight: 0,
    isKeyboardVisible: false,
  }),
}));

import { MobileEditorBottomToolbar } from "../editorToolbar/MobileEditorBottomToolbar";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";

function setViewportSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
}

function dispatchPointerDown(element: Element) {
  const EventCtor: typeof MouseEvent =
    typeof window.PointerEvent === "function" ? window.PointerEvent : MouseEvent;
  element.dispatchEvent(new EventCtor("pointerdown", { bubbles: true }));
}

function createController(
  overrides: Partial<MobileEditorToolbarController> = {}
): MobileEditorToolbarController {
  return {
    pluginInsertItems: [],
    isEditorFocused: true,
    isContentLinkPickerOpen: false,
    isInsertSheetOpen: false,
    executeAction: vi.fn(),
    applyHeadingLevel: vi.fn(),
    handleOpenInsertSheet: vi.fn(),
    handleCloseInsertSheet: vi.fn(),
    handleSelectInsertItem: vi.fn(),
    handleInsertImage: vi.fn(),
    applyColorMark: vi.fn(),
    applyGradientMark: vi.fn(),
    applyHighlightMark: vi.fn(),
    applyUnderlineStyle: vi.fn(),
    isActionDisabled: vi.fn(() => false),
    isActionActive: vi.fn(() => false),
    keepEditorFocus: vi.fn(),
    handleEditorFocus: vi.fn(),
    handleEditorBlur: vi.fn(),
    syncSelection: vi.fn(),
    handleCloseContentLinkPicker: vi.fn(),
    handleSelectContentLink: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides,
  };
}

describe("MobileEditorBottomToolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setViewportSize(390, 844);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--mobile-editor-toolbar-occlusion");
    vi.restoreAllMocks();
  });

  it("仅编辑器聚焦时渲染，失焦收起", () => {
    const blurController = createController({ isEditorFocused: false });
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={blurController} />);
    });
    expect(document.querySelector("nav")).toBeNull();

    act(() => {
      root.render(<MobileEditorBottomToolbar controller={createController()} />);
    });
    const toolbar = document.querySelector("nav");
    expect(toolbar).toBeTruthy();
    // 吸底：bottom 跟随键盘高度变量，而非安全区
    expect(toolbar?.getAttribute("style")?.includes("var(--kb-height")).toBe(true);
  });

  it("协作只读态下即使聚焦也收起工具栏", () => {
    // 只读编辑器渲染为 contentEditable=false，点击无法聚焦；真实路径是只读会话
    // 尚未解除但编辑器残留聚焦态（如冻结瞬间），须显式抑制
    const controller = createController();
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} readonly />);
    });
    expect(document.querySelector("nav")).toBeNull();
    expect(
      document.documentElement.style.getPropertyValue("--mobile-editor-toolbar-occlusion")
    ).toBe("");

    // 只读解除后恢复显示（会话重回 active）
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });
    expect(document.querySelector("nav")).toBeTruthy();
  });

  it("指定 portalContainer 时工具栏挂进该容器（跟随页面转场退场）", () => {
    const pageRoot = document.createElement("div");
    document.body.appendChild(pageRoot);
    const controller = createController();

    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} portalContainer={pageRoot} />);
    });

    expect(pageRoot.querySelector("nav")).toBeTruthy();
    expect(host.querySelector("nav")).toBeNull();
  });

  it("可见时写入滚动遮挡高度，隐藏时清除", () => {
    const occlusionVar = "--mobile-editor-toolbar-occlusion";
    const blurController = createController({ isEditorFocused: false });

    act(() => {
      root.render(<MobileEditorBottomToolbar controller={blurController} />);
    });
    expect(document.documentElement.style.getPropertyValue(occlusionVar)).toBe("");

    act(() => {
      root.render(<MobileEditorBottomToolbar controller={createController()} />);
    });
    // jsdom 无布局高度，走 46px 兜底 + 12px 间距
    expect(document.documentElement.style.getPropertyValue(occlusionVar)).toBe("58px");

    act(() => {
      root.render(<MobileEditorBottomToolbar controller={blurController} />);
    });
    expect(document.documentElement.style.getPropertyValue(occlusionVar)).toBe("");
  });

  it("吸底工具条包含撤销/重做与块级操作分组", () => {
    const controller = createController();
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });
    const toolbar = document.querySelector("nav");
    expect(toolbar).toBeTruthy();

    const undoButton = document.querySelector('button[aria-label="撤销"]');
    const redoButton = document.querySelector('button[aria-label="重做"]');
    expect(undoButton).toBeTruthy();
    expect(redoButton).toBeTruthy();

    act(() => {
      if (undoButton) dispatchPointerDown(undoButton);
    });
    expect(controller.undo).toHaveBeenCalled();
    act(() => {
      if (redoButton) dispatchPointerDown(redoButton);
    });
    expect(controller.redo).toHaveBeenCalled();

    // 块级操作与行内格式：H 收纳为弹条触发钮，图片/插入为直达按钮
    for (const label of [
      "加粗",
      "斜体",
      "删除线",
      "标题",
      "插入图片",
      "插入",
      "无序列表",
      "有序列表",
      "引用",
      "下划线",
      "链接",
      "颜色",
      "高亮",
    ]) {
      expect(document.querySelector(`button[aria-label="${label}"]`)).toBeTruthy();
    }
    // 分组竖线分隔
    expect(
      toolbar?.querySelectorAll("span[aria-hidden='true'].bg-line").length
    ).toBeGreaterThanOrEqual(4);
  });

  it("标题按钮弹出层级弹条，应用后关闭，点击外部也关闭", () => {
    const controller = createController();
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });

    const headingButton = document.querySelector(
      'button[aria-label="标题"]'
    ) as HTMLButtonElement | null;
    expect(headingButton).toBeTruthy();
    act(() => {
      if (headingButton) dispatchPointerDown(headingButton);
    });

    const panel = document.querySelector(
      '[data-testid="mobile-editor-heading-panel"]'
    ) as HTMLElement | null;
    expect(panel).toBeTruthy();
    for (const label of ["正文", "标题一", "标题二", "标题三"]) {
      expect(panel?.querySelector(`button[aria-label="${label}"]`)).toBeTruthy();
    }

    const headingThree = panel?.querySelector(
      'button[aria-label="标题三"]'
    ) as HTMLButtonElement | null;
    act(() => {
      if (headingThree) dispatchPointerDown(headingThree);
    });
    expect(controller.applyHeadingLevel).toHaveBeenCalledWith(3);
    expect(document.querySelector('[data-testid="mobile-editor-heading-panel"]')).toBeNull();

    act(() => {
      if (headingButton) dispatchPointerDown(headingButton);
    });
    act(() => {
      dispatchPointerDown(document.body);
    });
    expect(document.querySelector('[data-testid="mobile-editor-heading-panel"]')).toBeNull();
  });

  it("图片按钮直达选图，「+」打开插入面板并分发条目", () => {
    const controller = createController();
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });

    const imageButton = document.querySelector(
      'button[aria-label="插入图片"]'
    ) as HTMLButtonElement | null;
    expect(imageButton).toBeTruthy();
    act(() => {
      if (imageButton) dispatchPointerDown(imageButton);
    });
    expect(controller.handleInsertImage).toHaveBeenCalled();

    const insertButton = document.querySelector(
      'button[aria-label="插入"]'
    ) as HTMLButtonElement | null;
    expect(insertButton).toBeTruthy();
    act(() => {
      if (insertButton) dispatchPointerDown(insertButton);
    });
    expect(controller.handleOpenInsertSheet).toHaveBeenCalled();

    // 面板打开后渲染分组条目，点击分发到 controller
    act(() => {
      root.render(
        <MobileEditorBottomToolbar
          controller={createController({
            isInsertSheetOpen: true,
            handleSelectInsertItem: controller.handleSelectInsertItem,
          })}
        />
      );
    });
    const sheet = document.querySelector('[data-testid="insert-sheet"]');
    expect(sheet).toBeTruthy();
    for (const label of [
      "照片（相册）",
      "拍照",
      "视频",
      "音频",
      "网络图片",
      "网络视频",
      "网络音频",
      "表格",
      "代码块",
      "任务列表",
      "标签页",
      "折叠块",
      "高亮块",
      "提示块",
      "分割线",
      "公式",
      "流程图",
      "批注",
      "注解",
      "关联内容",
      "样式文本",
      "快捷键",
    ]) {
      expect(sheet?.textContent ?? "").toContain(label);
    }
    const tableItem = Array.from(sheet?.querySelectorAll("button") ?? []).find(
      button => button.textContent === "表格"
    );
    act(() => {
      tableItem?.click();
    });
    expect(controller.handleSelectInsertItem).toHaveBeenCalledWith("table");
  });

  it("依赖选区的工具禁用时应显示禁止态且不可点击", () => {
    const controller = createController({
      isActionDisabled: vi.fn(actionId => actionId === "color"),
    });
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });

    const colorButton = document.querySelector(
      'button[aria-label="颜色"]'
    ) as HTMLButtonElement | null;
    expect(colorButton).toBeTruthy();
    if (!colorButton) return;

    expect(colorButton.disabled).toBe(true);
    expect(colorButton.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      dispatchPointerDown(colorButton);
    });
    expect(
      document.querySelector('[data-testid="mobile-editor-palette"][data-action="color"]')
    ).toBeNull();
    expect(controller.keepEditorFocus).not.toHaveBeenCalled();
  });

  it("颜色/高亮/下划线应打开调色板并执行选项", () => {
    const controller = createController();
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });

    const colorButton = document.querySelector(
      'button[aria-label="颜色"]'
    ) as HTMLButtonElement | null;
    expect(colorButton).toBeTruthy();
    if (!colorButton) return;

    act(() => {
      dispatchPointerDown(colorButton);
    });
    expect(
      document.querySelector('[data-testid="mobile-editor-palette"][data-action="color"]')
    ).toBeTruthy();

    const redColor = document.querySelector(
      'button[aria-label="文本颜色 红色"]'
    ) as HTMLButtonElement | null;
    expect(redColor).toBeTruthy();
    if (!redColor) return;
    act(() => {
      dispatchPointerDown(redColor);
    });
    expect(controller.applyColorMark).toHaveBeenCalled();

    const highlightButton = document.querySelector(
      'button[aria-label="高亮"]'
    ) as HTMLButtonElement | null;
    expect(highlightButton).toBeTruthy();
    if (!highlightButton) return;
    act(() => {
      dispatchPointerDown(highlightButton);
    });
    const yellowHighlight = document.querySelector(
      'button[aria-label="高亮颜色 黄色"]'
    ) as HTMLButtonElement | null;
    expect(yellowHighlight).toBeTruthy();
    if (!yellowHighlight) return;
    act(() => {
      dispatchPointerDown(yellowHighlight);
    });
    expect(controller.applyHighlightMark).toHaveBeenCalledWith("yellow");

    const underlineButton = document.querySelector(
      'button[aria-label="下划线"]'
    ) as HTMLButtonElement | null;
    expect(underlineButton).toBeTruthy();
    if (!underlineButton) return;
    act(() => {
      dispatchPointerDown(underlineButton);
    });
    const dashedStyle = document.querySelector(
      'button[aria-label="下划线样式 虚线"]'
    ) as HTMLButtonElement | null;
    expect(dashedStyle).toBeTruthy();
    if (!dashedStyle) return;
    act(() => {
      dispatchPointerDown(dashedStyle);
    });
    expect(controller.applyUnderlineStyle).toHaveBeenCalledWith({
      lineType: "dashed",
    });
  });
});
