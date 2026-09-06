import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createEditor, Transforms } from "slate";
import { withYHistory, withYjs, YjsEditor } from "@slate-yjs/core";
import {
  createSharedDocument,
  getBody,
  getSourceText,
  prepareNodes,
  readSharedContent,
  replaceText,
  validateDocument,
} from "./document";

const article = {
  title: "测试文章",
  bannerBg: "",
  bannerPosition: "center",
  content: [
    { type: "paragraph", children: [{ text: "你好" }] },
    {
      type: "code-block",
      code: "hello world",
      language: "text",
      children: [{ text: "" }],
    },
  ],
};
const fork = (doc: Y.Doc) => {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
};

describe("共享文档", () => {
  it.each(["local", "shared"] as const)("%s 模式还原空文本时应恢复 formatted 类型", mode => {
    const content = [
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
      {
        type: "blockquote",
        children: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
      },
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "正文", bold: true }],
      },
    ];
    const doc = createSharedDocument({ ...article, content }, undefined, mode);
    try {
      expect(readSharedContent(doc).content).toMatchObject(content);
    } finally {
      doc.destroy();
    }
  });

  it("协作占位节点和默认子节点应使用 formatted 文本", () => {
    const doc = new Y.Doc();
    try {
      const prepared = prepareNodes(doc, [
        { type: "whiteboard", children: [{ type: "formatted", text: "" }] },
        { type: "tabs", tabsContent: [], children: [] },
        { type: "paragraph" },
      ]);
      for (const node of prepared) expect(node.children).toEqual([{ type: "formatted", text: "" }]);
    } finally {
      doc.destroy();
    }
  });

  it("标签页的独立 Y 文档应还原为 formatted 文本", () => {
    const paragraph = { type: "paragraph", children: [{ type: "formatted", text: "" }] };
    const doc = createSharedDocument({
      ...article,
      content: [
        {
          type: "tabs",
          activeKey: "a",
          tabsContent: [{ key: "a", title: "A", content: [paragraph] }],
          children: [paragraph],
        },
      ],
    });
    try {
      expect(readSharedContent(doc).content[0]).toMatchObject({
        children: [paragraph],
        tabsContent: [{ key: "a", content: [paragraph] }],
      });
    } finally {
      doc.destroy();
    }
  });

  it("在 Slate 0.123 中合并并发输入，并只撤销自己的内容", () => {
    const first = createSharedDocument(article);
    const second = fork(first);
    const a = withYHistory(withYjs(createEditor(), getBody(first)));
    const b = withYHistory(withYjs(createEditor(), getBody(second)));
    YjsEditor.connect(a);
    YjsEditor.connect(b);
    Transforms.insertText(a, "甲", { at: { path: [0, 0], offset: 1 } });
    YjsEditor.flushLocalChanges(a);
    Transforms.insertText(b, "乙", { at: { path: [0, 0], offset: 1 } });
    YjsEditor.flushLocalChanges(b);
    Y.applyUpdate(first, Y.encodeStateAsUpdate(second));
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
    expect(readSharedContent(first)).toEqual(readSharedContent(second));
    a.undo();
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
    expect(JSON.stringify(readSharedContent(first))).not.toContain("甲");
    expect(JSON.stringify(readSharedContent(first))).toContain("乙");
    YjsEditor.disconnect(a);
    YjsEditor.disconnect(b);
    first.destroy();
    second.destroy();
  });

  it("源码字段支持离线增量合并和重复投递", () => {
    const first = createSharedDocument(article);
    const second = fork(first);
    const id = readSharedContent(first).content[1].collabId as string;
    replaceText(getSourceText(first, id, "code"), "hello brave world");
    replaceText(getSourceText(second, id, "code"), "hello world!");
    const update = Y.encodeStateAsUpdate(second);
    Y.applyUpdate(first, update);
    Y.applyUpdate(first, update);
    expect(readSharedContent(first).content[1].code).toBe("hello brave world!");
    first.destroy();
    second.destroy();
  });

  it("隔离本地实体与源码渲染缓存", () => {
    const originals = new Map();
    const doc = createSharedDocument(
      {
        ...article,
        content: [
          {
            type: "whiteboard",
            whiteBoardContentId: 12,
            children: [{ text: "" }],
          },
          {
            type: "mermaid",
            chart: "graph TD",
            svg: "private",
            children: [{ text: "" }],
          },
        ],
      },
      originals
    );
    const shared = readSharedContent(doc);
    const local = readSharedContent(doc, originals);
    expect(shared.content[0].type).toBe("collaboration-placeholder");
    expect(shared.content[0].whiteBoardContentId).toBeUndefined();
    expect(local.content[0].whiteBoardContentId).toBe(12);
    expect(shared.content[1].svg).toBeUndefined();
    validateDocument(doc);
    doc.destroy();
  });

  it("content-link 随文档共享，不再剥离为占位符", () => {
    const doc = createSharedDocument({
      ...article,
      content: [
        {
          type: "paragraph",
          children: [
            { type: "formatted", text: "见 " },
            {
              type: "content-link",
              refId: 3,
              contentId: 7,
              contentType: "article",
              contentTitle: "引用文章",
              children: [{ type: "formatted", text: "引用文章" }],
            },
          ] as never,
        },
      ],
    });
    try {
      const shared = readSharedContent(doc);
      const link = (shared.content[0].children as { type?: string; [key: string]: unknown }[]).find(
        child => child.type === "content-link"
      );
      expect(link).toMatchObject({
        refId: 3,
        contentId: 7,
        contentType: "article",
        contentTitle: "引用文章",
      });
      validateDocument(doc);
    } finally {
      doc.destroy();
    }
  });

  it("标签页保存各自内容，并拒绝本地文件路径", () => {
    const doc = createSharedDocument({
      ...article,
      content: [
        {
          type: "tabs",
          activeKey: "b",
          tabsContent: [
            {
              key: "a",
              title: "A",
              content: [{ type: "paragraph", children: [{ text: "A" }] }],
            },
            { key: "b", title: "B", content: [] },
          ],
          children: [{ type: "paragraph", children: [{ text: "最新 B" }] }],
        },
      ],
    });
    const content = readSharedContent(doc).content[0].tabsContent as {
      content: unknown;
    }[];
    expect(JSON.stringify(content[1])).toContain("最新 B");
    doc.getMap("meta").set("bannerBg", "file:///etc/passwd");
    expect(() => validateDocument(doc)).toThrow("本地路径");
    doc.destroy();
  });
});
