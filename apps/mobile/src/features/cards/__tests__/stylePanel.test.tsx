import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backHandlers = vi.hoisted(() => [] as Array<{ open: boolean; dismiss: () => void }>);
vi.mock("../../../router/useSheetBackDismiss", () => ({
  useSheetBackDismiss: (open: boolean, dismiss: () => void) => {
    backHandlers.push({ open, dismiss });
  },
}));

import type { AccessoryItemId } from "../editorToolbar/MobileEditorBottomToolbar";
import { StylePanel } from "../editorToolbar/StylePanel";
import { TEXT_GRADIENT_OPTIONS, type ToolbarActionId } from "../editorToolbar/toolbarActions";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import { createControllerStub } from "./toolbarControllerStub";

function getButton(label: string): HTMLButtonElement | null {
  return document.querySelector(`button[aria-label="${label}"]`);
}

function getButtonByText(text: string): HTMLButtonElement | null {
  return (
    Array.from(document.querySelectorAll("button")).find(
      button => button.textContent?.trim() === text
    ) ?? null
  );
}

function click(button: HTMLButtonElement | null) {
  expect(button).toBeTruthy();
  act(() => {
    button?.click();
  });
}

function getBlockLabels(): string[] {
  return [
    "正文",
    "一级标题",
    "二级标题",
    "三级标题",
    "待办",
    "无序列表",
    "编号列表",
    "引用",
  ].filter(label => getButton(label) !== null);
}

describe("StylePanel", () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (
    controller: MobileEditorToolbarController,
    visibleButtons?: ReadonlySet<AccessoryItemId>
  ) => {
    act(() => {
      root.render(<StylePanel controller={controller} visibleButtons={visibleButtons} />);
    });
  };

  beforeEach(() => {
    backHandlers.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("渲染全部分组", () => {
    render(createControllerStub());
    expect(document.body.textContent).toContain("转换为");
    expect(document.body.textContent).toContain("行内样式");
    expect(getBlockLabels()).toHaveLength(8);
    for (const label of ["加粗", "斜体", "下划线", "删除线", "行内代码", "链接", "批注"]) {
      expect(getButton(label), label).toBeTruthy();
    }
    expect(document.querySelectorAll('button[aria-label^="文字颜色"]')).toHaveLength(8);
    expect(document.querySelectorAll('button[aria-label^="高亮颜色"]')).toHaveLength(6);
    expect(getButtonByText("更多文本样式")).toBeTruthy();
  });

  it("当前块类型对应项高亮", () => {
    render(createControllerStub({ getCurrentBlockKind: () => "h2" }));
    expect(getButton("二级标题")?.getAttribute("aria-pressed")).toBe("true");
    expect(getButton("二级标题")?.className).toContain("border-accent");
    expect(getButton("正文")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("转换为：标题 / 列表 / 引用 / 待办分发到对应控制器方法", () => {
    const controller = createControllerStub();
    render(controller);
    click(getButton("一级标题"));
    expect(controller.applyHeadingLevel).toHaveBeenLastCalledWith(1);
    click(getButton("三级标题"));
    expect(controller.applyHeadingLevel).toHaveBeenLastCalledWith(3);
    click(getButton("无序列表"));
    expect(controller.executeAction).toHaveBeenLastCalledWith("bulleted-list");
    click(getButton("编号列表"));
    expect(controller.executeAction).toHaveBeenLastCalledWith("numbered-list");
    click(getButton("引用"));
    expect(controller.executeAction).toHaveBeenLastCalledWith("quote");
    click(getButton("待办"));
    expect(controller.handleSelectInsertItem).toHaveBeenCalledWith("check-list");
  });

  it("转换为正文时先解除列表再退回段落", () => {
    const controller = createControllerStub({ getCurrentBlockKind: () => "numbered-list" });
    render(controller);
    click(getButton("正文"));
    expect(controller.executeAction).toHaveBeenCalledWith("numbered-list");
    expect(controller.applyHeadingLevel).toHaveBeenCalledWith("paragraph");
  });

  it("已是待办时点待办不再插入", () => {
    const controller = createControllerStub({ getCurrentBlockKind: () => "check-list" });
    render(controller);
    click(getButton("待办"));
    expect(controller.handleSelectInsertItem).not.toHaveBeenCalled();
  });

  it("行内样式执行动作并反映激活态", () => {
    const controller = createControllerStub({
      isActionActive: vi.fn((id: ToolbarActionId) => id === "italic"),
    });
    render(controller);
    expect(getButton("斜体")?.className).toContain("shadow-lift");
    expect(getButton("加粗")?.getAttribute("aria-pressed")).toBe("false");
    click(getButton("加粗"));
    expect(controller.executeAction).toHaveBeenCalledWith("bold");
    expect(controller.closePanel).not.toHaveBeenCalled();
  });

  it("链接先回到键盘态再执行", () => {
    const controller = createControllerStub();
    render(controller);
    click(getButton("链接"));
    expect(controller.closePanel).toHaveBeenCalledWith({
      showKeyboard: true,
      restoreSelection: true,
    });
    expect(controller.executeAction).toHaveBeenCalledWith("link");
    const closeOrder = vi.mocked(controller.closePanel).mock.invocationCallOrder[0];
    const executeOrder = vi.mocked(controller.executeAction).mock.invocationCallOrder[0];
    expect(closeOrder).toBeLessThan(executeOrder);
  });

  it("需要选区的动作禁用", () => {
    const controller = createControllerStub({
      isActionDisabled: vi.fn((id: ToolbarActionId) => id === "comment"),
    });
    render(controller);
    const comment = getButton("批注");
    expect(comment?.disabled).toBe(true);
    expect(comment?.className).toContain("opacity-40");
    click(comment);
    expect(controller.executeAction).not.toHaveBeenCalled();
  });

  it("颜色与高亮：点击调用对应方法，选中态跟随当前 marks", () => {
    const controller = createControllerStub({
      getCurrentMarks: () => ({ color: "#e33a32", darkColor: "#fa7873", highlight: "green" }),
    });
    render(controller);
    expect(getButton("文字颜色 红色")?.getAttribute("aria-pressed")).toBe("true");
    expect(getButton("文字颜色 默认")?.getAttribute("aria-pressed")).toBe("false");
    expect(getButton("高亮颜色 绿色")?.getAttribute("aria-pressed")).toBe("true");

    click(getButton("文字颜色 蓝色"));
    expect(controller.applyColorMark).toHaveBeenCalledWith("#245bdb", "#70a0ff");
    click(getButton("文字颜色 默认"));
    expect(controller.applyColorMark).toHaveBeenLastCalledWith(undefined, undefined);
    click(getButton("高亮颜色 黄色"));
    expect(controller.applyHighlightMark).toHaveBeenCalledWith("yellow");
    click(getButton("高亮颜色 默认"));
    expect(controller.applyHighlightMark).toHaveBeenLastCalledWith(undefined);
  });

  it("读不到 marks 时不显示选中态", () => {
    render(createControllerStub());
    expect(
      document.querySelectorAll('button[aria-pressed="true"][aria-label*="颜色"]')
    ).toHaveLength(0);
  });

  it("二级视图切换、执行与返回", () => {
    localStorage.setItem("underline-color", "blue");
    const controller = createControllerStub();
    render(controller);
    click(getButtonByText("更多文本样式"));
    expect(document.querySelector('[data-style-panel-view="more"]')).toBeTruthy();
    expect(getButton("下划线颜色 蓝色")?.getAttribute("aria-pressed")).toBe("true");

    click(getButton("下划线颜色 绿色"));
    expect(controller.applyUnderlineStyle).toHaveBeenCalledWith({ color: "green" });
    expect(getButton("下划线颜色 绿色")?.getAttribute("aria-pressed")).toBe("true");
    click(getButton("下划线线型 波浪"));
    expect(controller.applyUnderlineStyle).toHaveBeenLastCalledWith({ lineType: "wavy" });
    const [firstGradient] = TEXT_GRADIENT_OPTIONS;
    click(getButton(`渐变文字 ${firstGradient.label}`));
    expect(controller.applyGradientMark).toHaveBeenCalledWith(firstGradient.preset);
    click(getButtonByText("样式文本"));
    expect(controller.executeAction).toHaveBeenCalledWith("styled-text");
    click(getButtonByText("快捷键"));
    expect(controller.executeAction).toHaveBeenLastCalledWith("kbd");

    click(getButtonByText("更多文本样式"));
    expect(document.querySelector('[data-style-panel-view="main"]')).toBeTruthy();
  });

  it("二级视图时系统返回先回一级", () => {
    render(createControllerStub());
    expect(backHandlers.at(-1)?.open).toBe(false);
    click(getButtonByText("更多文本样式"));
    const latest = backHandlers.at(-1);
    expect(latest?.open).toBe(true);
    act(() => {
      latest?.dismiss();
    });
    expect(document.querySelector('[data-style-panel-view="main"]')).toBeTruthy();
    expect(backHandlers.at(-1)?.open).toBe(false);
  });

  it("白名单过滤各分组（闪卡）", () => {
    const flashcardButtons = new Set<AccessoryItemId>([
      "bold",
      "italic",
      "underline",
      "strikethrough",
      "block-paragraph",
      "block-heading",
      "block-bulleted-list",
      "block-numbered-list",
      "block-quote",
    ]);
    render(createControllerStub(), flashcardButtons);
    expect(getBlockLabels()).toEqual([
      "正文",
      "一级标题",
      "二级标题",
      "三级标题",
      "无序列表",
      "编号列表",
      "引用",
    ]);
    for (const label of ["加粗", "斜体", "下划线", "删除线"]) {
      expect(getButton(label), label).toBeTruthy();
    }
    for (const label of ["行内代码", "链接", "批注"]) {
      expect(getButton(label), label).toBeNull();
    }
    expect(document.querySelectorAll('button[aria-label^="文字颜色"]')).toHaveLength(0);
    expect(document.querySelectorAll('button[aria-label^="高亮颜色"]')).toHaveLength(0);
    expect(getButtonByText("更多文本样式")).toBeNull();
  });
});
