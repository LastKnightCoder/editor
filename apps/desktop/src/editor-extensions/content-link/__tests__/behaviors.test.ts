import {
  createEditor,
  Editor,
  Element,
  Node,
  Transforms,
  type Descendant,
  type NodeEntry,
} from "slate";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParagraphElement } from "@tau/editor";

vi.mock("../plugins/withMentionCommands", () => ({
  editorPanels: new WeakMap<object, unknown>(),
  createPanel: vi.fn(),
}));

import { editorPanels, createPanel } from "../plugins/withMentionCommands";
import { wrapContentLink } from "../components/utils";
import { contentLinkBehaviors, contentLinkForParagraph } from "../behaviors";

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

it("标题内跨按键样式关联内容，只包裹选中的字并保留标题结构", () => {
  const editor = createEditor();
  editor.isInline = node => node.type === "kbd" || node.type === "content-link";
  const normalize = editor.normalizeNode;
  editor.normalizeNode = (entry, options) => {
    const [node, path] = entry;
    if (
      Element.isElement(node) &&
      node.type === "content-link" &&
      contentLinkBehaviors.normalize?.(editor, [node, path])
    )
      return;
    normalize(entry, options);
  };
  editor.children = [
    {
      type: "header",
      level: 2,
      children: [
        { type: "formatted", text: "按 " },
        { type: "kbd", children: [{ type: "formatted", text: "A👩‍💻", bold: true }] },
        { type: "formatted", text: "继续", italic: true },
      ],
    },
  ];
  Transforms.select(editor, {
    anchor: { path: [0, 1, 0], offset: 1 },
    focus: { path: [0, 2], offset: 1 },
  });
  wrapContentLink(editor, 101, "card", "标题", 201);
  const links = Array.from(
    Editor.nodes(editor, { at: [], match: node => node.type === "content-link" })
  );
  expect(links.map(([node]) => Node.string(node))).toEqual(["👩‍💻", "继"]);
  expect(Node.get(editor, [0]).type).toBe("header");
  const key = Node.get(editor, [0, 1]);
  expect(key.type).toBe("kbd");
  expect(Node.string(key)).toBe("A👩‍💻");
  expect(Node.string(editor)).toBe("按 A👩‍💻继续");
});
