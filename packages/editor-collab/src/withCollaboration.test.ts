import { expect, it, vi } from "vitest";
import { createEditor, Editor, Transforms } from "slate";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { YjsEditor } from "@slate-yjs/core";
import { createSharedDocument, readSharedContent } from "@tau/collaboration";
import { withCollaboration } from "./withCollaboration";

const setup = (
  content: Parameters<typeof createSharedDocument>[0]["content"],
  overrides: Partial<Parameters<typeof withCollaboration>[1]> = {},
  options: Parameters<typeof withCollaboration>[2] = {}
) => {
  const doc = createSharedDocument({
    title: "内容",
    content,
    bannerBg: "",
    bannerPosition: "center",
  });
  const awareness = new Awareness(doc);
  const privateNodes = new Map();
  const editor = withCollaboration(
    createEditor(),
    {
      doc,
      awareness,
      origin: {},
      privateNodes,
      uploadResource: async () => "",
      resolveResource: async value => value,
      ...overrides,
    },
    options
  );
  YjsEditor.connect(editor);
  return { doc, awareness, privateNodes, editor };
};

it("关闭摘要光标后不发送选区，仍接收正文同步", async () => {
  const content = [{ type: "paragraph", children: [{ text: "原始正文" }] }];
  const source = setup(content);
  const previewDoc = new Y.Doc();
  Y.applyUpdate(previewDoc, Y.encodeStateAsUpdate(source.doc));
  const previewAwareness = new Awareness(previewDoc);
  const preview = setup(
    content,
    { doc: previewDoc, awareness: previewAwareness },
    { cursors: false }
  );
  try {
    Transforms.select(preview.editor, Editor.start(preview.editor, []));
    await Promise.resolve();
    expect(previewAwareness.getLocalState()?.selection).toBeUndefined();
    preview.editor.sendCursorPosition(preview.editor.selection);
    expect(previewAwareness.getLocalState()?.selection).toBeUndefined();

    Transforms.select(source.editor, Editor.end(source.editor, []));
    source.editor.insertText("追加内容");
    await Promise.resolve();
    YjsEditor.flushLocalChanges(source.editor);
    expect(source.awareness.getLocalState()?.selection).toBeTruthy();
    Y.applyUpdate(previewDoc, Y.encodeStateAsUpdate(source.doc));
    expect(Editor.string(preview.editor, [])).toBe("原始正文追加内容");
    expect(previewAwareness.getLocalState()?.selection).toBeUndefined();
  } finally {
    for (const instance of [source, preview]) {
      YjsEditor.disconnect(instance.editor);
      instance.awareness.destroy();
      instance.doc.destroy();
    }
    previewAwareness.destroy();
    previewDoc.destroy();
  }
});

it("全选替换后有有效内容，并可撤销自己的替换", () => {
  const { doc, awareness, editor } = setup([
    { type: "paragraph", children: [{ text: "原始正文" }] },
  ]);
  Transforms.select(editor, Editor.range(editor, []));
  expect(() => editor.insertText("替换正文")).not.toThrow();
  YjsEditor.flushLocalChanges(editor);
  expect(Editor.string(editor, [])).toBe("替换正文");
  expect(JSON.stringify(readSharedContent(doc).content)).toContain("替换正文");
  editor.undo();
  expect(Editor.string(editor, [])).toBe("原始正文");
  YjsEditor.disconnect(editor);
  awareness.destroy();
  doc.destroy();
});

it("拆分源码块后两个块使用独立的源码字段", () => {
  const { doc, awareness, editor } = setup([{ type: "paragraph", children: [{ text: "" }] }]);
  Transforms.insertNodes(editor, {
    type: "code-block",
    code: "print(1)",
    children: [{ text: "" }],
  } as never);
  YjsEditor.flushLocalChanges(editor);
  Transforms.select(editor, Editor.end(editor, [1]));
  editor.insertBreak();
  YjsEditor.flushLocalChanges(editor);
  const blocks = editor.children.filter(
    node => (node as { type?: string }).type === "code-block"
  ) as { collabId?: string; code?: string }[];
  expect(blocks.length).toBe(2);
  expect(blocks[0].collabId).toBeTruthy();
  expect(blocks[0].collabId).not.toBe(blocks[1].collabId);
  // 编辑第一个块的源码不应影响第二个块。
  const firstId = blocks[0].collabId!;
  const fields = doc.getMap("fields");
  const source = (fields.get(firstId) as Map<string, unknown>).get("code") as {
    toString(): string;
  };
  expect(source.toString()).toBe("print(1)");
  YjsEditor.disconnect(editor);
  awareness.destroy();
  doc.destroy();
});

it("共享模式插入白板等本地块时保留原始数据", () => {
  const { doc, awareness, privateNodes, editor } = setup([
    { type: "paragraph", children: [{ text: "" }] },
  ]);
  Transforms.insertNodes(editor, {
    type: "whiteboard",
    whiteBoardContentId: 42,
    children: [{ text: "" }],
  } as never);
  YjsEditor.flushLocalChanges(editor);
  const shared = readSharedContent(doc).content;
  const placeholder = shared.find(
    node => (node as { type?: string }).type === "collaboration-placeholder"
  ) as { collabId?: string } | undefined;
  expect(placeholder?.collabId).toBeTruthy();
  expect(privateNodes.get(placeholder!.collabId!)).toMatchObject({
    type: "whiteboard",
    whiteBoardContentId: 42,
  });
  YjsEditor.disconnect(editor);
  awareness.destroy();
  doc.destroy();
});

it("共享模式编辑私有块属性只落本机，不进入共享文档", () => {
  const putPrivateNode = vi.fn();
  const { doc, awareness, privateNodes, editor } = setup(
    [{ type: "paragraph", children: [{ text: "" }] }],
    { putPrivateNode }
  );
  Transforms.insertNodes(editor, {
    type: "whiteboard",
    whiteBoardContentId: 42,
    height: 300,
    children: [{ text: "" }],
  } as never);
  YjsEditor.flushLocalChanges(editor);
  const index = editor.children.findIndex(
    node => (node as { type?: string }).type === "collaboration-placeholder"
  );
  const collabId = (editor.children[index] as { collabId?: string }).collabId!;
  Transforms.setNodes(editor, { height: 480 } as never, { at: [index] });
  YjsEditor.flushLocalChanges(editor);
  expect(privateNodes.get(collabId)).toMatchObject({
    type: "whiteboard",
    whiteBoardContentId: 42,
    height: 480,
  });
  expect(putPrivateNode).toHaveBeenCalledWith(collabId, expect.objectContaining({ height: 480 }));
  const shared = readSharedContent(doc).content.find(
    node => (node as { type?: string }).type === "collaboration-placeholder"
  ) as { height?: number } | undefined;
  expect(shared?.height).toBeUndefined();
  YjsEditor.disconnect(editor);
  awareness.destroy();
  doc.destroy();
});
