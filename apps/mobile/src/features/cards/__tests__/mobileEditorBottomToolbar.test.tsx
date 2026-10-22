import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

const keyboardViewportState = vi.hoisted(() => ({
  viewportHeight: 544,
  keyboardHeight: 300,
  isKeyboardVisible: true,
  rawKeyboardHeight: 300,
  reservedHeight: 0,
  lastKeyboardHeight: 300,
}));

vi.mock("../../../components/KeyboardViewportProvider", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../components/KeyboardViewportProvider")>()),
  useKeyboardViewport: () => keyboardViewportState,
}));

import {
  MobileEditorBottomToolbar,
  type AccessoryItemId,
} from "../editorToolbar/MobileEditorBottomToolbar";
import type { TableEditingContext } from "../editorToolbar/editingContext";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import { createControllerStub } from "./toolbarControllerStub";

const OCCLUSION_VAR = "--mobile-editor-toolbar-occlusion";

const createController = createControllerStub;

function getToolbar(): HTMLElement | null {
  return document.querySelector('[data-mobile-editor-toolbar="true"]');
}

function getButton(label: string): HTMLButtonElement | null {
  return document.querySelector(`button[aria-label="${label}"]`);
}

function clickButton(label: string) {
  const button = getButton(label);
  expect(button, label).toBeTruthy();
  act(() => {
    button?.click();
  });
}

function getButtonLabels(): string[] {
  return Array.from(getToolbar()?.querySelectorAll("button") ?? []).map(
    button => button.getAttribute("aria-label") ?? button.textContent ?? ""
  );
}

function getSeparators(): NodeListOf<Element> | [] {
  return getToolbar()?.querySelectorAll("span[aria-hidden='true']") ?? [];
}

describe("MobileEditorBottomToolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (
    controller: MobileEditorToolbarController,
    extraProps: {
      readonly?: boolean;
      portalContainer?: HTMLElement | null;
      visibleButtons?: ReadonlySet<AccessoryItemId>;
    } = {}
  ) => {
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} {...extraProps} />);
    });
  };

  beforeEach(() => {
    keyboardViewportState.reservedHeight = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty(OCCLUSION_VAR);
    vi.restoreAllMocks();
  });

  it("按 isToolbarVisible 显示：贴住键盘上沿，失焦且无面板时收起", () => {
    render(createController({ isEditorFocused: false, isToolbarVisible: false }));
    expect(getToolbar()).toBeNull();

    render(createController());
    const toolbar = getToolbar();
    expect(toolbar).toBeTruthy();
    expect(toolbar?.getAttribute("style")).toContain(
      "bottom: max(var(--kb-height, 0px), env(safe-area-inset-bottom, 0px))"
    );
  });

  it("面板打开期间编辑器失焦仍显示配件栏与面板宿主", () => {
    keyboardViewportState.reservedHeight = 300;
    render(
      createController({ isEditorFocused: false, isToolbarVisible: true, activePanel: "style" })
    );
    expect(getToolbar()).toBeTruthy();
    const panel = document.querySelector('[data-testid="editor-panel-style"]');
    expect(panel).toBeTruthy();
    const panelHost = document.querySelector<HTMLElement>("[data-mobile-editor-panel]");
    expect(panelHost?.style.height).toBe("300px");
  });

  it("插入面板打开时面板宿主渲染插入面板", () => {
    render(createController({ isEditorFocused: false, activePanel: "insert" }));
    const panel = document.querySelector('[data-testid="editor-panel-insert"]');
    expect(panel?.querySelector('input[placeholder="搜索块"]')).toBeTruthy();
    expect(panel?.querySelector('[data-insert-kind="table"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="editor-panel-style"]')).toBeNull();
  });

  it("只读时隐藏并退出编辑，解除后恢复显示", () => {
    const controller = createController({ activePanel: "insert" });
    render(controller, { readonly: true });
    expect(getToolbar()).toBeNull();
    expect(document.querySelector("[data-mobile-editor-panel]")).toBeNull();
    expect(document.documentElement.style.getPropertyValue(OCCLUSION_VAR)).toBe("");
    expect(controller.exitEditing).toHaveBeenCalled();

    render(createController());
    expect(getToolbar()).toBeTruthy();
  });

  it("指定 portalContainer 时工具栏挂进该容器（跟随页面转场退场）", () => {
    const pageRoot = document.createElement("div");
    document.body.appendChild(pageRoot);
    render(createController(), { portalContainer: pageRoot });

    expect(pageRoot.querySelector('[data-mobile-editor-toolbar="true"]')).toBeTruthy();
    expect(host.querySelector('[data-mobile-editor-toolbar="true"]')).toBeNull();
  });

  it("可见时写入 46px 遮挡高度，隐藏时清除", () => {
    const hidden = createController({ isEditorFocused: false, isToolbarVisible: false });
    render(hidden);
    expect(document.documentElement.style.getPropertyValue(OCCLUSION_VAR)).toBe("");

    render(createController());
    expect(document.documentElement.style.getPropertyValue(OCCLUSION_VAR)).toBe("46px");

    render(hidden);
    expect(document.documentElement.style.getPropertyValue(OCCLUSION_VAR)).toBe("");
  });

  it("通用模式按钮触发对应 controller 方法", () => {
    const controller = createController();
    render(controller);

    expect(getButtonLabels()).toEqual([
      "插入",
      "样式",
      "待办",
      "无序列表",
      "反缩进",
      "缩进",
      "关联卡片",
      "图片",
      "撤销",
      "收起键盘",
    ]);

    clickButton("插入");
    expect(controller.togglePanel).toHaveBeenLastCalledWith("insert", 300);
    clickButton("样式");
    expect(controller.togglePanel).toHaveBeenLastCalledWith("style", 300);
    clickButton("待办");
    expect(controller.handleSelectInsertItem).toHaveBeenCalledWith("check-list");
    clickButton("无序列表");
    expect(controller.executeAction).toHaveBeenCalledWith("bulleted-list");
    clickButton("反缩进");
    expect(controller.outdent).toHaveBeenCalled();
    clickButton("缩进");
    expect(controller.indent).toHaveBeenCalled();
    clickButton("关联卡片");
    expect(controller.executeAction).toHaveBeenCalledWith("content-link");
    clickButton("图片");
    expect(controller.handleInsertImage).toHaveBeenCalled();
    clickButton("撤销");
    expect(controller.undo).toHaveBeenCalled();
  });

  it("按钮按下时阻止默认行为，避免抢走编辑器焦点", () => {
    render(createController());
    const button = getButton("待办");
    const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button?.dispatchEvent(pointerDown);
    button?.dispatchEvent(mouseDown);
    expect(pointerDown.defaultPrevented).toBe(true);
    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it("选中文字切到格式模式，「格式」标签折叠选区", () => {
    const controller = createController({
      editingContext: { kind: "selection" },
      isActionActive: vi.fn(actionId => actionId === "bold"),
    });
    render(controller);

    expect(getButtonLabels()).toEqual([
      "格式",
      "加粗",
      "斜体",
      "下划线",
      "删除线",
      "高亮",
      "链接",
      "批注",
      "行内代码",
      "样式",
    ]);
    expect(getButton("加粗")?.getAttribute("aria-pressed")).toBe("true");

    for (const [label, actionId] of [
      ["加粗", "bold"],
      ["斜体", "italic"],
      ["下划线", "underline"],
      ["删除线", "strikethrough"],
      ["高亮", "highlight"],
      ["链接", "link"],
      ["批注", "comment"],
      ["行内代码", "code"],
    ] as const) {
      clickButton(label);
      expect(controller.executeAction).toHaveBeenLastCalledWith(actionId);
    }

    clickButton("样式");
    expect(controller.togglePanel).toHaveBeenLastCalledWith("style", 300);

    const formatChip = Array.from(getToolbar()?.querySelectorAll("button") ?? []).find(
      button => button.textContent === "格式"
    );
    act(() => {
      formatChip?.click();
    });
    expect(controller.collapseSelectionToFocus).toHaveBeenCalled();
  });

  it("格式模式下依赖选区的动作禁用", () => {
    render(
      createController({
        editingContext: { kind: "selection" },
        isActionDisabled: vi.fn(actionId => actionId === "comment"),
      })
    );
    const commentButton = getButton("批注");
    expect(commentButton?.disabled).toBe(true);
    expect(commentButton?.className).toContain("opacity-40");
  });

  it("面板打开时回到通用模式，右端为键盘按钮，「+」切换为关闭", () => {
    const controller = createController({
      isEditorFocused: false,
      editingContext: { kind: "selection" },
      activePanel: "insert",
    });
    render(controller);

    expect(getButton("加粗")).toBeNull();
    expect(getButton("收起键盘")).toBeNull();
    expect(getButton("插入")).toBeNull();
    const closeInsert = getButton("关闭插入面板");
    expect(closeInsert?.className).toContain("bg-ink-1");

    clickButton("键盘");
    expect(controller.closePanel).toHaveBeenCalledWith({
      showKeyboard: true,
      restoreSelection: true,
    });

    clickButton("关闭插入面板");
    expect(controller.togglePanel).toHaveBeenCalledWith("insert", 300);
  });

  it("Aa 在样式面板打开时为激活态", () => {
    render(createController({ activePanel: "style" }));
    expect(getButton("样式")?.getAttribute("aria-pressed")).toBe("true");
    expect(getButton("样式")?.className).toContain("bg-accent-soft");
  });

  it("无面板时右端「收起键盘」退出编辑", () => {
    const controller = createController();
    render(controller);
    clickButton("收起键盘");
    expect(controller.exitEditing).toHaveBeenCalled();
    expect(controller.closePanel).not.toHaveBeenCalled();
  });

  it("白名单在两种模式下过滤条目", () => {
    const flashcardButtons = new Set<AccessoryItemId>([
      "style",
      "bulleted-list",
      "outdent",
      "indent",
      "undo",
      "bold",
      "italic",
      "underline",
      "strikethrough",
    ]);
    render(createController(), { visibleButtons: flashcardButtons });
    expect(getButtonLabels()).toEqual(["样式", "无序列表", "反缩进", "缩进", "撤销", "收起键盘"]);
    expect(getSeparators()).toHaveLength(1);

    render(createController({ editingContext: { kind: "selection" } }), {
      visibleButtons: flashcardButtons,
    });
    expect(getButtonLabels()).toEqual(["格式", "加粗", "斜体", "下划线", "删除线", "样式"]);
  });

  it("中段或右端为空时连分隔线一起去掉", () => {
    render(createController(), { visibleButtons: new Set<AccessoryItemId>(["plus"]) });
    expect(getButtonLabels()).toEqual(["插入", "收起键盘"]);
    expect(getSeparators()).toHaveLength(0);

    render(createController({ editingContext: { kind: "selection" } }), {
      visibleButtons: new Set<AccessoryItemId>(["bold"]),
    });
    expect(getButtonLabels()).toEqual(["格式", "加粗"]);
    expect(getSeparators()).toHaveLength(0);
  });

  describe("表格上下文", () => {
    const tableContext = (overrides: Partial<TableEditingContext> = {}): TableEditingContext => ({
      kind: "table",
      tablePath: [1],
      row: 1,
      col: 0,
      rowCount: 3,
      colCount: 2,
      ...overrides,
    });

    it("左端「表格」标签、中段行列按钮与对齐、右端表格菜单，按钮调用 runTableAction", () => {
      const controller = createController({ editingContext: tableContext() });
      render(controller);

      expect(getButtonLabels()).toEqual([
        "表格",
        "下方插行",
        "右侧插列",
        "删行",
        "删列",
        "对齐：左对齐",
        "表格菜单",
      ]);
      expect(getButton("对齐：左对齐")?.getAttribute("aria-pressed")).toBe("false");

      for (const [label, actionId] of [
        ["下方插行", "insert-row-below"],
        ["右侧插列", "insert-column-right"],
        ["删行", "delete-row"],
        ["删列", "delete-column"],
        ["对齐：左对齐", "cycle-align"],
      ] as const) {
        clickButton(label);
        expect(controller.runTableAction).toHaveBeenLastCalledWith(actionId);
      }

      clickButton("表格菜单");
      expect(controller.openTableMenu).toHaveBeenCalled();

      const chip = Array.from(getToolbar()?.querySelectorAll("button") ?? []).find(
        button => button.textContent === "表格"
      );
      act(() => {
        chip?.click();
      });
      expect(controller.dismissEditingContext).toHaveBeenCalled();
    });

    it("删行 / 删列按行列数禁用，对齐按钮显示当前对齐", () => {
      render(
        createController({
          editingContext: tableContext({ rowCount: 2, colCount: 1 }),
          getTableColumnAlign: vi.fn(() => "center" as const),
        })
      );
      expect(getButton("删行")?.disabled).toBe(true);
      expect(getButton("删列")?.disabled).toBe(true);
      expect(getButton("删列")?.className).toContain("opacity-40");
      expect(getButton("下方插行")?.disabled).toBe(false);
      expect(getButton("对齐：居中")?.getAttribute("aria-pressed")).toBe("true");
    });

    it("被退回（上下文按 text 给出）时渲染通用模式", () => {
      render(createController({ editingContext: { kind: "text" } }));
      expect(getButton("表格菜单")).toBeNull();
      expect(getButton("插入")).toBeTruthy();
    });

    it("白名单不含 context-table 时不出现表格上下文", () => {
      render(createController({ editingContext: tableContext() }), {
        visibleButtons: new Set<AccessoryItemId>(["undo"]),
      });
      expect(getButtonLabels()).toEqual(["撤销", "收起键盘"]);
    });

    it("面板打开时不显示表格上下文", () => {
      render(createController({ editingContext: tableContext(), activePanel: "style" }));
      expect(getButton("表格菜单")).toBeNull();
      expect(getButton("键盘")).toBeTruthy();
    });

    it("表格菜单列出可用的移动项与删除表格，点击执行", () => {
      const controller = createController({
        editingContext: tableContext({ row: 0, col: 1 }),
        isTableMenuOpen: true,
      });
      render(controller);
      const labels = () =>
        Array.from(document.querySelectorAll<HTMLButtonElement>("button")).map(
          button => button.textContent ?? ""
        );
      expect(labels()).toEqual(
        expect.arrayContaining(["下移此行", "左移此列", "删除表格", "取消"])
      );
      expect(labels()).not.toContain("上移此行");
      expect(labels()).not.toContain("右移此列");

      const deleteTable = Array.from(document.querySelectorAll("button")).find(
        button => button.textContent === "删除表格"
      );
      act(() => {
        deleteTable?.click();
      });
      expect(controller.runTableAction).toHaveBeenCalledWith("delete-table");
    });
  });

  it("白名单不含 context-code 时，代码块上下文按通用模式渲染", () => {
    render(
      createController({
        isEditorFocused: false,
        isToolbarVisible: true,
        editingContext: {
          kind: "code",
          element: { type: "code-block", children: [] } as never,
          path: [2],
          textarea: document.createElement("textarea"),
          uuid: "code-1",
          language: "ts",
        },
      }),
      { visibleButtons: new Set<AccessoryItemId>(["plus", "undo"]) }
    );
    expect(getToolbar()).toBeTruthy();
    expect(getButtonLabels()).toEqual(["插入", "撤销", "收起键盘"]);
  });
});
