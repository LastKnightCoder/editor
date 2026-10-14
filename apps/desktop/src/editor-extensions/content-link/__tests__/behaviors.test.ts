import { createEditor, type Descendant, type NodeEntry } from "slate";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParagraphElement } from "@tau/editor";

vi.mock("../plugins/withMentionCommands", () => ({
  editorPanels: new WeakMap<object, unknown>(),
  createPanel: vi.fn(),
}));

import { editorPanels, createPanel } from "../plugins/withMentionCommands";
import { contentLinkForParagraph } from "../behaviors";

const mockCreatePanel = vi.mocked(createPanel);
const panels = editorPanels as unknown as WeakMap<object, unknown>;

const selectionStub = {
  rangeCount: 1,
  getRangeAt: () => ({
    getBoundingClientRect: () => ({ left: 100, top: 200, height: 20 }),
  }),
};

interface FakeStoreState {
  mentionPanelVisible: boolean;
  inputValue: string;
  trigger: string;
  setState: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
}

const createFakeStore = (overrides: Partial<FakeStoreState> = {}) => {
  const setState = vi.fn();
  const reset = vi.fn();
  const state: FakeStoreState = {
    mentionPanelVisible: false,
    inputValue: "",
    trigger: "@",
    setState,
    reset,
    ...overrides,
  };
  return { store: { getState: () => state, setState, reset }, state };
};

/** 光标落在段落文本末尾的编辑器 */
const createEditorWithText = (text: string) => {
  const editor = createEditor();
  editor.children = [
    {
      type: "paragraph",
      children: [{ type: "formatted", text }],
    },
  ] as Descendant[];
  editor.selection = {
    anchor: { path: [0, 0], offset: text.length },
    focus: { path: [0, 0], offset: text.length },
  };
  return editor;
};

const runInsertText = (editor: ReturnType<typeof createEditor>, text: string) =>
  contentLinkForParagraph.insertText!(
    editor,
    [editor.children[0], [0]] as unknown as NodeEntry<ParagraphElement>,
    text
  );

beforeEach(() => {
  mockCreatePanel.mockReset();
  vi.spyOn(window, "getSelection").mockReturnValue(selectionStub as unknown as Selection);
});

describe("insertMention 触发词打开面板", () => {
  it("光标前已有 [ 时再输入 [ 打开面板，inputValue 记为 [[", () => {
    const editor = createEditorWithText("[");
    const { store } = createFakeStore();
    mockCreatePanel.mockReturnValue({ store } as never);

    expect(runInsertText(editor, "[")).toBe(false);
    expect(mockCreatePanel).toHaveBeenCalledWith(editor);
    expect(store.setState).toHaveBeenCalledWith({
      mentionPanelVisible: true,
      position: { x: 100, y: 220 },
      inputValue: "[[",
      trigger: "[[",
    });
  });

  it("光标前已有 【 时再输入 【 打开面板，inputValue 记为 【【", () => {
    const editor = createEditorWithText("【");
    const { store } = createFakeStore();
    mockCreatePanel.mockReturnValue({ store } as never);

    runInsertText(editor, "【");
    expect(store.setState).toHaveBeenCalledWith(
      expect.objectContaining({ inputValue: "【【", trigger: "【【" })
    );
  });

  it("光标前是普通字符时输入 [ 不打开面板", () => {
    const editor = createEditorWithText("a");
    const { store } = createFakeStore();
    mockCreatePanel.mockReturnValue({ store } as never);

    expect(runInsertText(editor, "[")).toBe(false);
    expect(mockCreatePanel).not.toHaveBeenCalled();
    expect(store.setState).not.toHaveBeenCalled();
  });

  it("输入 @ 仍按单字符触发", () => {
    const editor = createEditorWithText("正文");
    const { store } = createFakeStore();
    mockCreatePanel.mockReturnValue({ store } as never);

    runInsertText(editor, "@");
    expect(store.setState).toHaveBeenCalledWith(
      expect.objectContaining({ inputValue: "@", trigger: "@" })
    );
  });
});

describe("insertMention 面板已开时的输入更新", () => {
  it("普通字符追加到搜索词", () => {
    const editor = createEditorWithText("[[卡");
    const { store } = createFakeStore({
      mentionPanelVisible: true,
      inputValue: "[[卡",
      trigger: "[[",
    });
    panels.set(editor, { store });

    runInsertText(editor, "片");
    expect(store.setState).toHaveBeenCalledWith({
      inputValue: "[[卡片",
      position: { x: 100, y: 220 },
    });
  });

  it("wiki 触发的面板里空格进入搜索词（对齐 Obsidian）", () => {
    const editor = createEditorWithText("[[项目");
    const { store } = createFakeStore({
      mentionPanelVisible: true,
      inputValue: "[[项目",
      trigger: "[[",
    });
    panels.set(editor, { store });

    runInsertText(editor, " ");
    expect(store.setState).toHaveBeenCalledWith({
      inputValue: "[[项目 ",
      position: { x: 100, y: 220 },
    });
    expect(store.reset).not.toHaveBeenCalled();
  });

  it("@ 触发的面板里空格仍关闭面板", () => {
    const editor = createEditorWithText("@某");
    const { store } = createFakeStore({
      mentionPanelVisible: true,
      inputValue: "@某",
      trigger: "@",
    });
    panels.set(editor, { store });

    runInsertText(editor, " ");
    expect(store.reset).toHaveBeenCalled();
    expect(store.setState).not.toHaveBeenCalled();
  });
});
