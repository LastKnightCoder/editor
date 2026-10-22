import { createEditor, Editor, Node, Transforms, type Descendant } from "slate";
import { withHistory } from "slate-history";
import { afterEach, describe, expect, it, vi } from "vitest";

const { copyNodeToClipboard } = vi.hoisted(() => ({
  copyNodeToClipboard: vi.fn(async (..._args: unknown[]) => true),
}));

vi.mock("@tau/editor/api", () => ({
  copyNodeToClipboard,
  createParagraph: () => ({ type: "paragraph", children: [{ type: "formatted", text: "" }] }),
}));

import {
  canMoveBlocks,
  cloneBlockWithFreshIdentity,
  copyBlocks,
  cutBlocks,
  deleteBlocks,
  duplicateBlocks,
  moveBlocks,
  normalizeBlockIndices,
} from "../blockOps";

const paragraph = (text: string) =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as unknown as Descendant;

/** 覆盖 void 块、表格、代码块：块操作只做顶层节点移动，与类型无关 */
const imageBlock = () =>
  ({
    type: "image",
    url: "a.png",
    children: [{ type: "formatted", text: "" }],
  }) as unknown as Descendant;
const codeBlock = () =>
  ({
    type: "code-block",
    uuid: "code-1",
    code: "let a = 1;",
    language: "js",
    children: [{ type: "formatted", text: "" }],
  }) as unknown as Descendant;
const tableBlock = () =>
  ({
    type: "table",
    children: [
      {
        type: "table-row",
        children: [
          { type: "table-cell", children: [paragraph("格")] },
          { type: "table-cell", children: [paragraph("子")] },
        ],
      },
    ],
  }) as unknown as Descendant;

function createDoc(children: Descendant[]) {
  const editor = withHistory(createEditor());
  // 只校验块操作本身，跳过 void / 表格的结构规范化
  editor.normalizeNode = () => {};
  editor.children = children;
  return editor;
}

const texts = (editor: Editor) => editor.children.map(node => Node.string(node));
const types = (editor: Editor) => editor.children.map(node => (node as { type: string }).type);

describe("normalizeBlockIndices / canMoveBlocks", () => {
  it("升序去重并丢弃越界下标", () => {
    expect(normalizeBlockIndices([3, 1, 1, -1, 9, 2], 4)).toEqual([1, 2, 3]);
  });

  it("上移含首块、下移含末块、空选择时不可移动", () => {
    expect(canMoveBlocks([0, 2], "up", 4)).toBe(false);
    expect(canMoveBlocks([1, 2], "up", 4)).toBe(true);
    expect(canMoveBlocks([1, 3], "down", 4)).toBe(false);
    expect(canMoveBlocks([1, 2], "down", 4)).toBe(true);
    expect(canMoveBlocks([], "down", 4)).toBe(false);
  });
});

describe("moveBlocks", () => {
  it("连续块整组上移一位，返回新下标", () => {
    const editor = createDoc([paragraph("A"), paragraph("B"), paragraph("C"), paragraph("D")]);
    expect(moveBlocks(editor, [2, 1], "up")).toEqual([0, 1]);
    expect(texts(editor)).toEqual(["B", "C", "A", "D"]);
  });

  it("连续块整组下移一位", () => {
    const editor = createDoc([paragraph("A"), paragraph("B"), paragraph("C"), paragraph("D")]);
    expect(moveBlocks(editor, [1, 2], "down")).toEqual([2, 3]);
    expect(texts(editor)).toEqual(["A", "D", "B", "C"]);
  });

  it("不连续的选中块各自与相邻未选块互换", () => {
    const editor = createDoc([
      paragraph("A"),
      paragraph("B"),
      paragraph("C"),
      paragraph("D"),
      paragraph("E"),
    ]);
    expect(moveBlocks(editor, [1, 3], "up")).toEqual([0, 2]);
    expect(texts(editor)).toEqual(["B", "A", "D", "C", "E"]);

    expect(moveBlocks(editor, [0, 2], "down")).toEqual([1, 3]);
    expect(texts(editor)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("到边界返回 null 且不改动文档", () => {
    const editor = createDoc([paragraph("A"), paragraph("B"), paragraph("C")]);
    expect(moveBlocks(editor, [0, 2], "up")).toBeNull();
    expect(moveBlocks(editor, [1, 2], "down")).toBeNull();
    expect(texts(editor)).toEqual(["A", "B", "C"]);
    expect(editor.history.undos).toHaveLength(0);
  });

  it("多块移动只产生一个撤销步", () => {
    const editor = createDoc([paragraph("A"), paragraph("B"), paragraph("C"), paragraph("D")]);
    moveBlocks(editor, [1, 3], "up");
    expect(editor.history.undos).toHaveLength(1);
    editor.undo();
    expect(texts(editor)).toEqual(["A", "B", "C", "D"]);
  });

  it("void 块、表格、代码块同样移动", () => {
    const editor = createDoc([paragraph("A"), imageBlock(), tableBlock(), codeBlock()]);
    expect(moveBlocks(editor, [1, 2, 3], "up")).toEqual([0, 1, 2]);
    expect(types(editor)).toEqual(["image", "table", "code-block", "paragraph"]);
  });
});

describe("deleteBlocks", () => {
  it("删除不连续的多个块，一次撤销恢复", () => {
    const editor = createDoc([paragraph("A"), paragraph("B"), paragraph("C"), paragraph("D")]);
    deleteBlocks(editor, [3, 0, 2]);
    expect(texts(editor)).toEqual(["B"]);
    expect(editor.history.undos).toHaveLength(1);
    editor.undo();
    expect(texts(editor)).toEqual(["A", "B", "C", "D"]);
  });

  it("删空文档时补一个空段落，撤销恢复原文档", () => {
    const editor = createDoc([paragraph("A"), imageBlock()]);
    deleteBlocks(editor, [0, 1]);
    expect(editor.children).toEqual([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ]);
    editor.undo();
    expect(types(editor)).toEqual(["paragraph", "image"]);
    expect(texts(editor)).toEqual(["A", ""]);
  });

  it("空选择不改动文档", () => {
    const editor = createDoc([paragraph("A")]);
    deleteBlocks(editor, []);
    expect(editor.history.undos).toHaveLength(0);
  });
});

describe("duplicateBlocks", () => {
  it("在最后一个选中块之后按顺序插入深拷贝，返回副本下标", () => {
    const editor = createDoc([paragraph("A"), paragraph("B"), paragraph("C"), paragraph("D")]);
    expect(duplicateBlocks(editor, [2, 0])).toEqual([3, 4]);
    expect(texts(editor)).toEqual(["A", "B", "C", "A", "C", "D"]);
    expect(editor.children[3]).not.toBe(editor.children[0]);
    expect(editor.children[3]).toEqual(editor.children[0]);
  });

  it("副本的 uuid 换新、勾选项清除 taskId 与实例状态，原块不变", () => {
    const checkItem = {
      type: "check-list-item",
      checked: true,
      taskId: "task-1",
      taskReminder: { at: 1 },
      taskOccurrenceState: { "2026-10-01": "done" },
      taskCompletedAt: 123,
      children: [paragraph("待办")],
    };
    const editor = createDoc([
      codeBlock(),
      {
        type: "check-list",
        children: [
          checkItem,
          {
            type: "check-list-item",
            checked: false,
            taskId: "task-2",
            children: [paragraph("二")],
          },
        ],
      } as unknown as Descendant,
    ]);
    duplicateBlocks(editor, [0, 1]);
    const [code, list, codeCopy, listCopy] = editor.children as unknown as Array<
      Record<string, unknown> & { children: Array<Record<string, unknown>> }
    >;
    expect(code.uuid).toBe("code-1");
    expect(typeof codeCopy.uuid).toBe("string");
    expect(codeCopy.uuid).not.toBe("code-1");
    expect(codeCopy.code).toBe("let a = 1;");
    expect(list.children[0].taskId).toBe("task-1");
    expect(listCopy.children[0]).not.toHaveProperty("taskId");
    expect(listCopy.children[0].taskOccurrenceState).toEqual({});
    expect(listCopy.children[0].taskCompletedAt).toBeNull();
    expect(listCopy.children[0].taskReminder).toEqual({ at: 1 });
    expect(listCopy.children[1]).not.toHaveProperty("taskId");
    expect(listCopy.children[1]).not.toHaveProperty("taskOccurrenceState");
  });

  it("递归刷新嵌套节点的 uuid，块内引用字段（tabKey / activeKey）保持", () => {
    const tabs = {
      type: "tabs",
      activeKey: "k1",
      children: [
        {
          type: "tab-pane",
          tabKey: "k1",
          children: [{ type: "image", uuid: "img-1", url: "a.png", children: [] }],
        },
      ],
    } as unknown as Descendant;
    const copy = cloneBlockWithFreshIdentity(tabs) as unknown as {
      activeKey: string;
      children: Array<{ tabKey: string; children: Array<{ uuid: string }> }>;
    };
    expect(copy.activeKey).toBe("k1");
    expect(copy.children[0].tabKey).toBe("k1");
    expect(copy.children[0].children[0].uuid).not.toBe("img-1");
    expect((tabs as unknown as typeof copy).children[0].children[0].uuid).toBe("img-1");
  });

  it("复制表格只产生一个撤销步", () => {
    const editor = createDoc([tableBlock(), paragraph("B")]);
    expect(duplicateBlocks(editor, [0])).toEqual([1]);
    expect(types(editor)).toEqual(["table", "table", "paragraph"]);
    expect(editor.history.undos).toHaveLength(1);
    editor.undo();
    expect(types(editor)).toEqual(["table", "paragraph"]);
  });
});

describe("copyBlocks", () => {
  afterEach(() => {
    copyNodeToClipboard.mockClear();
  });

  it("按文档顺序传入选中节点", async () => {
    const editor = createDoc([paragraph("A"), paragraph("B"), paragraph("C")]);
    await expect(copyBlocks(editor, [2, 0])).resolves.toBe(true);
    const [, nodes, feedback] = copyNodeToClipboard.mock.calls[0];
    expect(nodes).toEqual([editor.children[0], editor.children[2]]);
    expect(feedback).toMatchObject({ success: expect.any(Function), error: expect.any(Function) });
  });

  it("空选择不写剪贴板", async () => {
    const editor = createDoc([paragraph("A")]);
    await expect(copyBlocks(editor, [])).resolves.toBe(false);
    expect(copyNodeToClipboard).not.toHaveBeenCalled();
  });
});

describe("cutBlocks", () => {
  afterEach(() => {
    copyNodeToClipboard.mockReset();
    copyNodeToClipboard.mockImplementation(async () => true);
  });

  it("写入剪贴板（不降级纯文本）后删除，单个撤销步", async () => {
    const editor = createDoc([paragraph("A"), paragraph("B"), paragraph("C")]);
    await expect(cutBlocks(editor, [2, 0])).resolves.toBe(true);
    expect(copyNodeToClipboard.mock.calls[0][3]).toEqual({ allowPlainTextFallback: false });
    expect(texts(editor)).toEqual(["B"]);
    editor.undo();
    expect(texts(editor)).toEqual(["A", "B", "C"]);
  });

  it("写入失败不删除；写入期间块移位按引用删除", async () => {
    const editor = createDoc([paragraph("A"), paragraph("B")]);
    copyNodeToClipboard.mockImplementationOnce(async () => false);
    await expect(cutBlocks(editor, [0])).resolves.toBe(false);
    expect(texts(editor)).toEqual(["A", "B"]);

    let release: (value: boolean) => void = () => {};
    copyNodeToClipboard.mockImplementationOnce(
      () => new Promise<boolean>(resolve => (release = resolve))
    );
    const pending = cutBlocks(editor, [1]);
    Transforms.insertNodes(editor, paragraph("新"), { at: [0] });
    release(true);
    await pending;
    expect(texts(editor)).toEqual(["新", "A"]);
  });
});
