import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Puzzle } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reservation = vi.hoisted(() => ({
  reserve: vi.fn(),
  releaseWhenKeyboardShown: vi.fn(),
  releaseNow: vi.fn(),
}));
const viewport = vi.hoisted(() => ({ rawKeyboardHeight: 0 }));

vi.mock("../../../components/KeyboardViewportProvider", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../components/KeyboardViewportProvider")>()),
  useKeyboardReservation: () => reservation,
  useKeyboardViewport: () => ({
    viewportHeight: 544,
    keyboardHeight: 300,
    isKeyboardVisible: false,
    rawKeyboardHeight: viewport.rawKeyboardHeight,
    reservedHeight: 300,
    lastKeyboardHeight: 300,
  }),
}));

import { InsertPanel } from "../editorToolbar/InsertPanel";
import {
  INSERT_ITEMS,
  RECENT_INSERT_STORAGE_KEY,
  type InsertItem,
} from "../editorToolbar/insertItems";
import type {
  InsertSheetItemKind,
  MobileEditorToolbarController,
} from "../editorToolbar/useMobileEditorToolbarController";
import { createControllerStub } from "./toolbarControllerStub";

function getSection(key: string): HTMLElement | null {
  return document.querySelector(`[data-insert-section="${key}"]`);
}

function getItem(kind: string, scope: ParentNode = document): HTMLButtonElement | null {
  return scope.querySelector(`button[data-insert-kind="${kind}"]`);
}

function getSearchInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[placeholder="搜索块"]');
  expect(input).toBeTruthy();
  return input as HTMLInputElement;
}

function typeQuery(value: string) {
  const input = getSearchInput();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(button: HTMLButtonElement | null) {
  expect(button).toBeTruthy();
  act(() => {
    button?.click();
  });
}

describe("InsertPanel", () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (
    controller: MobileEditorToolbarController,
    extraProps: {
      allowedKinds?: ReadonlySet<InsertSheetItemKind>;
      items?: readonly InsertItem[];
    } = {}
  ) => {
    act(() => {
      root.render(<InsertPanel controller={controller} {...extraProps} />);
    });
  };

  beforeEach(() => {
    reservation.reserve.mockClear();
    viewport.rawKeyboardHeight = 0;
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
  });

  it("按分组渲染宫格，插件组无条目时不渲染", () => {
    render(createControllerStub());
    const groups: Array<[string, string]> = [
      ["basic", "基础"],
      ["media", "媒体"],
      ["advanced", "高级"],
      ["inline", "行内"],
    ];
    for (const [key, title] of groups) {
      const section = getSection(key);
      expect(section, key).toBeTruthy();
      expect(section?.textContent).toContain(title);
    }
    expect(getSection("plugin")).toBeNull();
    expect(document.querySelectorAll("button[data-insert-kind]")).toHaveLength(INSERT_ITEMS.length);
    expect(getItem("table", getSection("advanced") as HTMLElement)).toBeTruthy();
    expect(getItem("camera", getSection("media") as HTMLElement)).toBeTruthy();
    expect(getItem("table")?.querySelector("span")?.className).toContain(
      "bg-tag-4-soft text-tag-4"
    );
  });

  it("插件条目归入插件组并显示来源", () => {
    const pluginItem: InsertItem = {
      kind: "mermaid",
      label: "思维导图",
      keywords: ["mindmap"],
      group: "plugin",
      icon: Puzzle,
      tone: 3,
      source: { pluginId: "mind-map", name: "思维导图插件" },
    };
    render(createControllerStub(), { items: [...INSERT_ITEMS, pluginItem] });
    const section = getSection("plugin");
    expect(section?.textContent).toContain("插件");
    expect(section?.textContent).toContain("思维导图插件");
  });

  it("搜索：显示结果列表与组名，隐藏分组；无结果显示空态", () => {
    render(createControllerStub());
    typeQuery("bg");
    const results = getSection("results");
    expect(results).toBeTruthy();
    expect(getSection("basic")).toBeNull();
    expect(results?.querySelectorAll("button")).toHaveLength(1);
    expect(getItem("table", results as HTMLElement)?.textContent).toBe("表格高级");

    typeQuery("不存在的块");
    expect(getSection("results")).toBeNull();
    expect(document.body.textContent).toContain("没有匹配的块");

    typeQuery("");
    expect(getSection("basic")).toBeTruthy();
  });

  it("运行时插件贡献可搜索并执行，关闭面板恢复选区，轻量白名单不显示插件", () => {
    const run = vi.fn();
    const controller = createControllerStub({
      pluginInsertItems: [{ title: "ABC 乐谱", keywords: ["music"], icon: Puzzle, run }],
    });
    render(controller);
    expect(getSection("plugin")?.textContent).toContain("ABC 乐谱");
    typeQuery("music");
    click(getItem("plugin:0"));
    expect(run).toHaveBeenCalledOnce();
    expect(controller.handleSelectInsertItem).not.toHaveBeenCalled();
    expect(controller.closePanel).toHaveBeenCalledWith({
      showKeyboard: true,
      restoreSelection: true,
    });
    expect(localStorage.getItem(RECENT_INSERT_STORAGE_KEY) ?? "").not.toContain("plugin:");
    typeQuery("");
    render(controller, { allowedKinds: new Set(["table"]) });
    expect(getSection("plugin")).toBeNull();
  });

  it("搜索框按下不阻止默认行为；获焦后预留 = max(原面板高度, 预计键盘 + 结果区)，失焦恢复", () => {
    const onSearchingChange = vi.fn();
    const controller = createControllerStub();
    const renderWith = () =>
      act(() => {
        root.render(<InsertPanel controller={controller} onSearchingChange={onSearchingChange} />);
      });
    renderWith();
    const input = getSearchInput();
    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    act(() => {
      input.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    act(() => {
      input.focus();
    });
    expect(onSearchingChange).toHaveBeenLastCalledWith(true);
    // 键盘尚未升起：按预计键盘高度（最近一轮键盘峰值 300）+ 结果区提前预留
    expect(reservation.reserve).toHaveBeenLastCalledWith(300 + 220);
    viewport.rawKeyboardHeight = 280;
    renderWith();
    expect(reservation.reserve).toHaveBeenLastCalledWith(280 + 220);
    act(() => {
      input.blur();
    });
    expect(onSearchingChange).toHaveBeenLastCalledWith(false);
    expect(reservation.reserve).toHaveBeenLastCalledWith(300);
  });

  it("最近使用：读取存储，搜索时隐藏，插入后写入", () => {
    localStorage.setItem(RECENT_INSERT_STORAGE_KEY, JSON.stringify(["math", "table"]));
    const controller = createControllerStub();
    render(controller);
    const recent = getSection("recent");
    expect(
      Array.from(recent?.querySelectorAll("button") ?? []).map(button => button.textContent)
    ).toEqual(["公式", "表格"]);

    typeQuery("表");
    expect(getSection("recent")).toBeNull();
    typeQuery("");

    click(getItem("divider", getSection("basic") as HTMLElement));
    expect(JSON.parse(localStorage.getItem(RECENT_INSERT_STORAGE_KEY) ?? "[]")).toEqual([
      "divider",
      "math",
      "table",
    ]);
  });

  it("无记录时不显示最近使用", () => {
    render(createControllerStub());
    expect(getSection("recent")).toBeNull();
  });

  it("块插入：面板内执行后回到键盘，恢复插入后的面板选区", () => {
    const controller = createControllerStub();
    render(controller);
    click(getItem("table"));
    expect(controller.handleSelectInsertItem).toHaveBeenCalledWith("table");
    expect(controller.closePanel).toHaveBeenCalledWith({
      showKeyboard: true,
      restoreSelection: true,
    });
    const insertOrder = vi.mocked(controller.handleSelectInsertItem).mock.invocationCallOrder[0];
    const closeOrder = vi.mocked(controller.closePanel).mock.invocationCallOrder[0];
    expect(insertOrder).toBeLessThan(closeOrder);
  });

  it("选择器 / 浮层类条目：插入后只关面板，不弹键盘", () => {
    for (const kind of ["camera", "image-url", "content-link"] as const) {
      const controller = createControllerStub();
      render(controller);
      click(getItem(kind));
      expect(controller.handleSelectInsertItem, kind).toHaveBeenCalledWith(kind);
      expect(controller.closePanel, kind).toHaveBeenCalledWith({ showKeyboard: false });
    }
  });

  it("点击结果项先让搜索框失焦再插入", () => {
    const controller = createControllerStub();
    render(controller);
    const input = getSearchInput();
    act(() => {
      input.focus();
    });
    typeQuery("公式");
    let focusedAtInsert: Element | null = input;
    vi.mocked(controller.handleSelectInsertItem).mockImplementation(() => {
      focusedAtInsert = document.activeElement;
    });
    click(getItem("math", getSection("results") as HTMLElement));
    expect(focusedAtInsert).not.toBe(input);
    expect(controller.handleSelectInsertItem).toHaveBeenCalledWith("math");
  });

  it("allowedKinds 过滤条目，过滤为空的分组不渲染", () => {
    localStorage.setItem(RECENT_INSERT_STORAGE_KEY, JSON.stringify(["math", "table"]));
    render(createControllerStub(), { allowedKinds: new Set(["table", "image"]) });
    expect(document.querySelectorAll('[data-insert-section="advanced"] button')).toHaveLength(1);
    expect(getSection("basic")).toBeNull();
    expect(getSection("inline")).toBeNull();
    expect(getItem("image", getSection("media") as HTMLElement)).toBeTruthy();
    expect(getSection("recent")?.querySelectorAll("button")).toHaveLength(1);
  });
});
