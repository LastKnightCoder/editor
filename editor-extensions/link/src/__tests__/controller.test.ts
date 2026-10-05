import { Editor, Transforms } from "slate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARET_OPEN_DELAY,
  HOVER_CLOSE_GRACE,
  HOVER_OPEN_DELAY,
  LinkPanelController,
} from "../panel/controller";
import { findLinkEntry } from "../operations";
import type { LinkElement } from "../types";
import { createLinkEditor, link, text } from "./helpers";

const setup = () => {
  const editor = createLinkEditor([
    text("看 "),
    link("https://a.com", text("甲")),
    text(" 和 "),
    link("https://b.com", text("乙")),
  ]);
  const [first, second] = [
    ...Editor.nodes(editor, { at: [], match: node => (node as LinkElement).type === "link" }),
  ].map(([node]) => node as LinkElement);
  return { editor, controller: new LinkPanelController(editor), first, second };
};

const caretInto = (editor: Editor, element: LinkElement) => {
  const [[, path]] = Editor.nodes(editor, { at: [], match: node => node === element });
  Transforms.select(editor, Editor.end(editor, path));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("悬停", () => {
  it("停留够久才出现，划过不打扰", () => {
    const { controller, first } = setup();
    controller.hoverEnter(first, 10);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY - 1);
    expect(controller.getState().mode).toBe("closed");
    controller.hoverLeave(first);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    expect(controller.getState().mode).toBe("closed");

    controller.hoverEnter(first, 10);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    expect(controller.getState()).toMatchObject({ mode: "view", element: first, via: "hover" });
  });

  it("已打开时移到另一个链接立即切换", () => {
    const { controller, first, second } = setup();
    controller.hoverEnter(first, 10);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    controller.hoverLeave(first);
    controller.hoverEnter(second, 10);
    expect(controller.getState()).toMatchObject({ mode: "view", element: second });
    vi.advanceTimersByTime(HOVER_CLOSE_GRACE);
    expect(controller.getState()).toMatchObject({ mode: "view", element: second });
  });

  it("离开有宽限，移进浮层不收起", () => {
    const { controller, first } = setup();
    controller.hoverEnter(first, 10);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    controller.hoverLeave(first);
    vi.advanceTimersByTime(HOVER_CLOSE_GRACE - 1);
    controller.panelEnter();
    vi.advanceTimersByTime(HOVER_CLOSE_GRACE);
    expect(controller.getState().mode).toBe("view");
    controller.panelLeave();
    vi.advanceTimersByTime(HOVER_CLOSE_GRACE);
    expect(controller.getState().mode).toBe("closed");
  });

  it("跨行时指针纵坐标变化才更新", () => {
    const { controller, first } = setup();
    controller.hoverEnter(first, 10);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    const before = controller.getState();
    controller.hoverMove(first, 13);
    expect(controller.getState()).toBe(before);
    controller.hoverMove(first, 40);
    expect(controller.getState()).toMatchObject({ pointerY: 40 });
  });

  it("开始打字收起悬停打开的浮层", () => {
    const { controller, first } = setup();
    controller.hoverEnter(first, 10);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    controller.typed();
    expect(controller.getState().mode).toBe("closed");
  });

  it("编辑期间悬停其它链接不打断", () => {
    const { controller, first, second } = setup();
    controller.openEdit(first);
    controller.hoverEnter(second, 10);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    expect(controller.getState()).toMatchObject({ mode: "edit", element: first });
  });
});

describe("光标进入", () => {
  it("光标停在链接里一会儿出现，离开即收起", () => {
    const { editor, controller, first } = setup();
    caretInto(editor, first);
    controller.caretChanged(editor.selection, true);
    vi.advanceTimersByTime(CARET_OPEN_DELAY);
    expect(controller.getState()).toMatchObject({ mode: "view", element: first, via: "caret" });

    Transforms.select(editor, Editor.start(editor, []));
    controller.caretChanged(editor.selection, true);
    expect(controller.getState().mode).toBe("closed");
  });

  it("编辑器未聚焦时不出现", () => {
    const { editor, controller, first } = setup();
    caretInto(editor, first);
    controller.caretChanged(editor.selection, false);
    vi.advanceTimersByTime(CARET_OPEN_DELAY);
    expect(controller.getState().mode).toBe("closed");
  });

  it("开始打字收起，且在离开这个链接前不再自动弹出", () => {
    const { editor, controller, first } = setup();
    caretInto(editor, first);
    controller.caretChanged(editor.selection, true);
    vi.advanceTimersByTime(CARET_OPEN_DELAY);
    controller.typed();
    expect(controller.getState().mode).toBe("closed");

    editor.insertText("x");
    controller.caretChanged(editor.selection, true);
    vi.advanceTimersByTime(CARET_OPEN_DELAY);
    expect(controller.getState().mode).toBe("closed");

    Transforms.select(editor, Editor.start(editor, []));
    controller.caretChanged(editor.selection, true);
    caretInto(editor, findLinkEntry(editor, [])![0]);
    controller.caretChanged(editor.selection, true);
    vi.advanceTimersByTime(CARET_OPEN_DELAY);
    expect(controller.getState().mode).toBe("view");
  });

  it("悬停打开的浮层不受光标离开影响", () => {
    const { editor, controller, first } = setup();
    controller.hoverEnter(first, 10);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    Transforms.select(editor, Editor.start(editor, []));
    controller.caretChanged(editor.selection, true);
    expect(controller.getState().mode).toBe("view");
  });
});

describe("⌘L 与工具条入口", () => {
  it("光标在链接里编辑该链接，并记住原选区", () => {
    const { editor, controller, first } = setup();
    caretInto(editor, first);
    const selection = editor.selection;
    controller.startFromSelection("below");
    expect(controller.getState()).toMatchObject({
      mode: "edit",
      element: first,
      restore: selection,
    });
  });

  it("展开选区新建时清掉选区让工具条让位，范围随文档变化", () => {
    const { editor, controller } = setup();
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 1 },
    });
    controller.startFromSelection("above");
    const state = controller.getState();
    expect(state).toMatchObject({ mode: "create", placement: "above" });
    expect(editor.selection).toBeNull();

    Transforms.insertText(editor, "前", { at: { path: [0, 0], offset: 0 } });
    expect(state.mode === "create" && state.range.current).toEqual({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 2 },
    });
    controller.close();
    expect(state.mode === "create" && state.range.current).toBeNull();
  });
});
