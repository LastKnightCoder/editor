import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tau/editor/src/components/HoveringToolbar/floatingPosition", () => ({
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

function mockRect(
  element: Element,
  partial: Partial<DOMRect> &
    Pick<DOMRect, "top" | "left" | "width" | "height">,
) {
  const rect: DOMRect = {
    x: partial.left,
    y: partial.top,
    top: partial.top,
    left: partial.left,
    width: partial.width,
    height: partial.height,
    right: partial.left + partial.width,
    bottom: partial.top + partial.height,
    toJSON() {
      return {};
    },
  } as DOMRect;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
}

function dispatchPointerDown(element: Element) {
  const EventCtor: typeof MouseEvent =
    typeof window.PointerEvent === "function"
      ? window.PointerEvent
      : MouseEvent;
  element.dispatchEvent(new EventCtor("pointerdown", { bubbles: true }));
}

function createController(
  overrides: Partial<MobileEditorToolbarController> = {},
): MobileEditorToolbarController {
  return {
    isEditorFocused: true,
    isContentLinkPickerOpen: false,
    executeAction: vi.fn(),
    applyColorMark: vi.fn(),
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
    ...overrides,
  };
}

describe("MobileEditorBottomToolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setViewportSize(390, 844);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
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
    vi.restoreAllMocks();
  });

  it("仅在编辑器聚焦时渲染底栏，主栏包含清除格式，More 间距类应统一", () => {
    setViewportSize(460, 844);
    const blurController = createController({ isEditorFocused: false });
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={blurController} />);
    });
    expect(document.querySelector("nav")).toBeNull();

    const controller = createController({ isEditorFocused: true });
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });
    const toolbar = document.querySelector("nav");
    expect(toolbar).toBeTruthy();
    const toolbarButtons = toolbar?.querySelectorAll("button");
    const lastToolbarButton = toolbarButtons?.[toolbarButtons.length - 1];
    expect(lastToolbarButton?.getAttribute("aria-label")).toBe("更多菜单");
    expect(document.querySelector('button[aria-label="下划线"]')).toBeTruthy();
    expect(
      document.querySelector('button[aria-label="样式文本"]'),
    ).toBeTruthy();
    expect(document.querySelector('button[aria-label="链接"]')).toBeTruthy();
    expect(document.querySelector('button[aria-label="颜色"]')).toBeTruthy();
    expect(document.querySelector('button[aria-label="高亮"]')).toBeTruthy();
    expect(
      document.querySelector('button[aria-label="清除格式"]'),
    ).toBeTruthy();

    const textStyleButton = document.querySelector(
      'button[aria-label="文本样式菜单"]',
    ) as HTMLButtonElement | null;
    expect(textStyleButton).toBeTruthy();
    act(() => {
      if (textStyleButton) {
        dispatchPointerDown(textStyleButton);
      }
    });

    let submenu = document.querySelector(
      '[data-testid="mobile-editor-submenu"]',
    ) as HTMLElement | null;
    expect(submenu).toBeTruthy();
    expect(submenu?.querySelector('button[aria-label="快捷键"]')).toBeTruthy();

    const moreButton = document.querySelector(
      'button[aria-label="更多菜单"]',
    ) as HTMLButtonElement | null;
    expect(moreButton).toBeTruthy();
    expect(moreButton?.className.includes("ml-auto")).toBe(false);
    expect(moreButton?.className.includes("flex-1")).toBe(true);
    expect(moreButton?.className.includes("basis-0")).toBe(true);
    expect(textStyleButton?.textContent?.trim()).toBe("");
    expect(moreButton?.textContent?.trim()).toBe("");
    act(() => {
      if (moreButton) {
        dispatchPointerDown(moreButton);
      }
    });

    submenu = document.querySelector(
      '[data-testid="mobile-editor-submenu"]',
    ) as HTMLElement | null;
    expect(submenu?.querySelector('button[aria-label="批注"]')).toBeTruthy();
    expect(
      submenu?.querySelector('button[aria-label="关联内容"]'),
    ).toBeTruthy();
    expect(submenu?.querySelector('button[aria-label="注解"]')).toBeNull();
  });

  it("依赖选区的工具禁用时应显示禁止态且不可点击", () => {
    const controller = createController({
      isActionDisabled: vi.fn((actionId) => actionId === "color"),
      isActionActive: vi.fn((actionId) => actionId === "color"),
    });
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });

    const colorButton = document.querySelector(
      'button[aria-label="颜色"]',
    ) as HTMLButtonElement | null;
    expect(colorButton).toBeTruthy();
    if (!colorButton) return;

    expect(colorButton.disabled).toBe(true);
    expect(colorButton.getAttribute("aria-disabled")).toBe("true");
    expect(colorButton.className.includes("cursor-not-allowed")).toBe(true);
    expect(colorButton.className.includes("bg-gray-900")).toBe(false);

    act(() => {
      dispatchPointerDown(colorButton);
    });
    expect(
      document.querySelector(
        '[data-testid="mobile-editor-palette"][data-action="color"]',
      ),
    ).toBeNull();
    expect(controller.keepEditorFocus).not.toHaveBeenCalled();
  });

  it("宽度不足时应将部分按钮自动收纳进更多", () => {
    setViewportSize(220, 844);
    const controller = createController();
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(document.querySelector('button[aria-label="颜色"]')).toBeNull();
    const moreButton = document.querySelector(
      'button[aria-label="更多菜单"]',
    ) as HTMLButtonElement | null;
    expect(moreButton).toBeTruthy();
    if (!moreButton) return;

    act(() => {
      dispatchPointerDown(moreButton);
    });
    const submenu = document.querySelector(
      '[data-testid="mobile-editor-submenu"]',
    ) as HTMLElement | null;
    expect(submenu).toBeTruthy();
    expect(submenu?.querySelector('button[aria-label="颜色"]')).toBeTruthy();
    expect(submenu?.querySelector('button[aria-label="高亮"]')).toBeTruthy();
  });

  it("失焦后重新聚焦应立即按当前宽度重算，避免 more 被挤出", () => {
    setViewportSize(220, 844);
    const controller = createController({ isEditorFocused: false });
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });
    expect(document.querySelector("nav")).toBeNull();

    act(() => {
      root.render(
        <MobileEditorBottomToolbar
          controller={{ ...controller, isEditorFocused: true }}
        />,
      );
    });

    expect(document.querySelector('button[aria-label="颜色"]')).toBeNull();
    expect(
      document.querySelector('button[aria-label="更多菜单"]'),
    ).toBeTruthy();
  });

  it("二级菜单应防越界，且点击外部后关闭", () => {
    const controller = createController();
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });

    const textStyleButton = document.querySelector(
      'button[aria-label="文本样式菜单"]',
    ) as HTMLButtonElement | null;
    expect(textStyleButton).toBeTruthy();
    if (!textStyleButton) return;

    mockRect(textStyleButton, {
      top: 278,
      left: -16,
      width: 40,
      height: 20,
    });
    setViewportSize(320, 300);

    act(() => {
      dispatchPointerDown(textStyleButton);
    });

    const submenu = document.querySelector(
      '[data-testid="mobile-editor-submenu"]',
    ) as HTMLElement | null;
    expect(submenu).toBeTruthy();
    if (!submenu) return;

    mockRect(submenu, {
      top: 0,
      left: 0,
      width: 260,
      height: 44,
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    const left = Number.parseFloat(submenu.style.left || "0");
    const top = Number.parseFloat(submenu.style.top || "0");
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 260).toBeLessThanOrEqual(312);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + 44).toBeLessThanOrEqual(292);

    act(() => {
      dispatchPointerDown(document.body);
    });

    expect(
      document.querySelector('[data-testid="mobile-editor-submenu"]'),
    ).toBeNull();
  });

  it("颜色/高亮/下划线应打开调色板并执行选项", () => {
    const controller = createController();
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} />);
    });

    const colorButton = document.querySelector(
      'button[aria-label="颜色"]',
    ) as HTMLButtonElement | null;
    expect(colorButton).toBeTruthy();
    if (!colorButton) return;

    act(() => {
      dispatchPointerDown(colorButton);
    });
    expect(
      document.querySelector(
        '[data-testid="mobile-editor-palette"][data-action="color"]',
      ),
    ).toBeTruthy();

    const redColor = document.querySelector(
      'button[aria-label="文本颜色 红色"]',
    ) as HTMLButtonElement | null;
    expect(redColor).toBeTruthy();
    if (!redColor) return;
    act(() => {
      dispatchPointerDown(redColor);
    });
    expect(controller.applyColorMark).toHaveBeenCalled();

    const highlightButton = document.querySelector(
      'button[aria-label="高亮"]',
    ) as HTMLButtonElement | null;
    expect(highlightButton).toBeTruthy();
    if (!highlightButton) return;
    act(() => {
      dispatchPointerDown(highlightButton);
    });
    const yellowHighlight = document.querySelector(
      'button[aria-label="高亮颜色 黄色"]',
    ) as HTMLButtonElement | null;
    expect(yellowHighlight).toBeTruthy();
    if (!yellowHighlight) return;
    act(() => {
      dispatchPointerDown(yellowHighlight);
    });
    expect(controller.applyHighlightMark).toHaveBeenCalledWith("yellow");

    const underlineButton = document.querySelector(
      'button[aria-label="下划线"]',
    ) as HTMLButtonElement | null;
    expect(underlineButton).toBeTruthy();
    if (!underlineButton) return;
    act(() => {
      dispatchPointerDown(underlineButton);
    });
    const dashedStyle = document.querySelector(
      'button[aria-label="下划线样式 虚线"]',
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
