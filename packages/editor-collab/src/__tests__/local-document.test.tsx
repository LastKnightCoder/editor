import { act, createRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  createEditor,
  Editor as SlateEditor,
  Node,
  Element,
  Transforms,
  type Descendant,
} from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { describe, expect, it } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import {
  IEditorTextFields,
  captureElementSubmission,
  defineElement,
  defineExtension,
} from "@tau/editor/api";
import { createLocalYjsDocument } from "../localDocument";
import * as Y from "yjs";

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

describe("本地 Y.Doc 文档", () => {
  it("同一文档的两个投影使用独立 origin，编辑能互相同步", () => {
    const session = createLocalYjsDocument([paragraph("正文")]);
    const binding = session.document.binding;
    if (!binding) throw new Error("缺少绑定");
    const first = binding.install(createEditor());
    const second = binding.install(createEditor());
    binding.connect(first);
    binding.connect(second);
    try {
      Transforms.insertText(first, "更新", { at: { path: [0, 0], offset: 2 } });
      session.flush();
      expect(second.children).toEqual(first.children);
      expect(session.getContent()).toEqual([paragraph("正文更新")]);
    } finally {
      session.dispose();
    }
  });
  it("文本、属性和结构增量更新，未修改 Y.XmlText 身份保持", () => {
    const session = createLocalYjsDocument([paragraph("甲"), paragraph("乙")]);
    try {
      const first = session.root.toDelta()[0].insert;
      const second = session.root.toDelta()[1].insert;
      session.updateContent([paragraph("新增"), paragraph("甲"), paragraph("乙")], "external");
      expect(session.root.toDelta()[1].insert).toBe(first);
      expect(session.root.toDelta()[2].insert).toBe(second);
      session.updateContent([paragraph("新增"), paragraph("甲修改"), paragraph("乙")], "external");
      expect(session.root.toDelta()[1].insert).toBe(first);
      expect(session.root.toDelta()[2].insert).toBe(second);
      expect(session.getContent()).toEqual([
        paragraph("新增"),
        paragraph("甲修改"),
        paragraph("乙"),
      ]);
    } finally {
      session.dispose();
    }
  });

  it("保留未知节点和文本字段，删除已移除属性，不执行产品退役清理", () => {
    const initial = [
      {
        type: "question",
        custom: { enabled: true },
        children: [{ type: "formatted", text: "未知文本", vendor: [1, 2] }],
      },
    ] as unknown as Descendant[];
    const session = createLocalYjsDocument(initial);
    try {
      expect(session.getContent()).toEqual(initial);
      const next = [
        { type: "question", children: [{ type: "formatted", text: "未知文本" }] },
      ] as unknown as Descendant[];
      session.updateContent(next);
      expect(session.getContent()).toEqual(next);
      session.undo();
      expect(session.getContent()).toEqual(initial);
    } finally {
      session.dispose();
    }
  });

  it("无法无损表达的空文本属性在写入前明确拒绝", () => {
    const session = createLocalYjsDocument([paragraph("原文")]);
    try {
      expect(() =>
        session.updateContent([
          { type: "paragraph", children: [{ type: "formatted", text: "", vendor: true }] },
        ] as unknown as Descendant[])
      ).toThrow("空文本");
      expect(session.getContent()).toEqual([paragraph("原文")]);
    } finally {
      session.dispose();
    }
  });

  it("嵌套内联节点、格式拆分合并和 Unicode 文本连续对账不丢内容", () => {
    const session = createLocalYjsDocument();
    try {
      for (let version = 0; version < 40; version++) {
        const next = Array.from({ length: 1 + (version % 7) }, (_, index) => ({
          type: index % 2 ? "paragraph" : "custom-container",
          ...(version % 3 ? { alignment: "center" } : {}),
          children: [
            {
              type: "formatted",
              text: `第${index}段🙂${version % 4}`,
              ...(version % 2 ? { bold: true } : {}),
            },
            {
              type: "custom-inline",
              value: version % 3,
              children: [{ type: "formatted", text: "内联内容" }],
            },
            { type: "formatted", text: "e\u0301尾部", italic: true },
          ],
        })) as unknown as Descendant[];
        session.updateContent(next, "external");
        expect(session.getContent()).toEqual(next);
      }
      const split = [
        {
          type: "paragraph",
          children: [
            { type: "formatted", text: "前缀" },
            { type: "formatted", text: "中间", bold: true },
            { type: "formatted", text: "后缀" },
          ],
        },
      ] as Descendant[];
      session.updateContent([paragraph("前缀中间后缀")], "external");
      session.updateContent(split, "external");
      expect(session.getContent()).toEqual(split);
      session.updateContent([paragraph("前缀中间后缀")], "external");
      expect(session.getContent()).toEqual([paragraph("前缀中间后缀")]);
    } finally {
      session.dispose();
    }
  });

  it("真实编辑器不重挂载未修改块，富文本与外部更新共用 Y.Doc 和撤销", async () => {
    let mounts = 0;
    const Probe = ({
      attributes,
      children,
    }: {
      attributes: Record<string, unknown>;
      children: React.ReactNode;
    }) => {
      useEffect(() => {
        mounts++;
      }, []);
      return <div {...attributes}>{children}</div>;
    };
    const block = {
      type: "probe",
      children: [{ type: "formatted", text: "保留组件" }],
    } as unknown as Descendant;
    const session = createLocalYjsDocument([paragraph("正文"), block]);
    const kit = createEditorKit({
      extensions: [
        defineExtension({
          id: "test.probe",
          elements: [{ type: "probe", kind: "block", render: Probe }],
        }),
      ],
    });
    const ref = createRef<EditorRef>();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Editor ref={ref} document={session.document} kit={kit} readonly={false} />
          </DndProvider>
        )
      );
      const editor = ref.current?.getEditor();
      if (!editor) throw new Error("编辑器未挂载");
      expect(mounts).toBe(1);
      const stableNode = editor.children[1];
      const target = editor.children[0];
      if (target.type !== "paragraph") throw new Error("段落未挂载");
      const submission = captureElementSubmission(editor, { element: target });
      await act(async () =>
        session.updateContent([paragraph("新增"), paragraph("正文"), block], "external")
      );
      expect(ref.current?.getEditor()).toBe(editor);
      expect(editor.children[2]).toBe(stableNode);
      expect(mounts).toBe(1);
      expect(
        submission.commit(({ path }) => {
          expect(path).toEqual([1]);
        }).status
      ).toBe("committed");
      session.undoManager.stopCapturing();
      await act(async () =>
        Transforms.insertText(editor, "本地", { at: SlateEditor.end(editor, [1]) })
      );
      expect(session.getContent()[1]).toEqual(paragraph("正文本地"));
      await act(async () =>
        session.updateContent([paragraph("外部"), paragraph("正文本地"), block], "external")
      );
      await act(async () => session.undo());
      expect(session.getContent().slice(0, 2)).toEqual([paragraph("外部"), paragraph("正文")]);
      await act(async () => session.redo());
      expect(session.getContent()[1]).toEqual(paragraph("正文本地"));
      expect(mounts).toBe(1);
    } finally {
      await act(async () => root.unmount());
      session.dispose();
      host.remove();
    }
  });
});

it("连接时在 Yjs 转换后补落点，不改 Y.Doc 或撤销历史，重连与后续编辑仍正常", () => {
  const initial = [
    {
      type: "paragraph",
      children: [
        {
          type: "link",
          url: "https://example.com",
          children: [{ type: "formatted", text: "链接" }],
        },
      ],
    },
  ] as unknown as Descendant[];
  let calls = 0;
  const session = createLocalYjsDocument(initial, {
    prepareInitialContent: (content, editor) => {
      calls++;
      const first = content[0];
      if (!Element.isElement(first)) throw new Error("缺少段落");
      expect(first.children).toHaveLength(1);
      const child = first.children[0];
      if (!Element.isElement(child)) throw new Error("缺少行内节点");
      expect(editor.isInline(child)).toBe(true);
      return content.map(node => ({
        ...node,
        children: [
          { type: "formatted", text: "" },
          ...(node as Element).children,
          { type: "formatted", text: "" },
        ],
      })) as unknown as Descendant[];
    },
  });
  const binding = session.document.binding;
  if (!binding) throw new Error("缺少绑定");
  const base = createEditor();
  base.isInline = node => node.type === "link";
  const editor = binding.install(base),
    normalize = editor.normalize;
  const before = Array.from(Y.encodeStateAsUpdate(session.doc));
  try {
    binding.connect(editor);
    expect((editor.children[0] as Element).children).toHaveLength(3);
    expect(editor.normalize).toBe(normalize);
    expect(Array.from(Y.encodeStateAsUpdate(session.doc))).toEqual(before);
    expect(session.undoManager.undoStack).toHaveLength(0);
    binding.disconnect(editor);
    binding.connect(editor);
    expect(calls).toBe(2);
    expect(editor.normalize).toBe(normalize);
    Transforms.insertText(editor, "新", { at: { path: [0, 1, 0], offset: 0 } });
    session.flush();
    expect(Node.string(session.getContent()[0])).toBe("新链接");
    session.undo();
    expect(session.getContent()).toEqual(initial);
  } finally {
    session.dispose();
  }
});

it("连接准备失败时仍恢复编辑器的规范化方法", () => {
  const session = createLocalYjsDocument([paragraph("正文")], {
    prepareInitialContent: () => {
      throw new Error("准备失败");
    },
  });
  const binding = session.document.binding;
  if (!binding) throw new Error("缺少绑定");
  const editor = binding.install(createEditor()),
    normalize = editor.normalize;
  try {
    expect(() => binding.connect(editor)).toThrow("准备失败");
    expect(editor.normalize).toBe(normalize);
    expect(session.getContent()).toEqual([paragraph("正文")]);
  } finally {
    session.dispose();
  }
});

it("源码字段经 field 绑定在本地文档里可编辑：写入 Y.Doc、外部更新同步，撤销走文档的 UndoManager", async () => {
  const sourceElement = defineElement({
    type: "test-source",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["source"] },
    render: ({ attributes, children }) => <div {...attributes}>{children}</div>,
  });
  const kit = createEditorKit({
    extensions: [defineExtension({ id: "test.source", elements: [sourceElement] })],
  });
  const session = createLocalYjsDocument([
    { type: "test-source", source: "初始", children: [{ type: "formatted", text: "" }] },
    paragraph("后"),
  ] as unknown as Descendant[]);
  const ref = createRef<EditorRef>();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const read = () => (session.getContent()[0] as unknown as { source: string }).source;
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} document={session.document} readonly={false} />
        </DndProvider>
      )
    );
    const editor = ref.current!.getEditor();
    const fields = editor.tryGetService(IEditorTextFields);
    expect(fields).toBeDefined();
    const field = fields!.open(editor, editor.children[0] as Element, "source");
    try {
      await act(async () =>
        field.edit({ offset: 2, remove: 0, text: "甲", revision: field.getSnapshot().revision })
      );
      expect(read()).toBe("初始甲");
      await act(async () => {
        session.updateContent(
          [
            { type: "test-source", source: "外部", children: [{ type: "formatted", text: "" }] },
            paragraph("后"),
          ] as unknown as Descendant[],
          "external"
        );
      });
      expect(field.getSnapshot().value).toBe("外部");
      await act(async () =>
        field.edit({ offset: 2, remove: 0, text: "乙", revision: field.getSnapshot().revision })
      );
      expect(read()).toBe("外部乙");
      await act(async () => field.undo());
      expect(read()).toBe("外部");
      expect(() => fields!.open(editor, editor.children[1] as Element, "source")).toThrow(
        "字段未声明文本编辑语义"
      );
    } finally {
      field.dispose();
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    session.dispose();
  }
});
