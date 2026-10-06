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
  replaceSharedContent,
  replaceText,
  isSafeResource,
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

  it("整树替换正文后读回为新内容，且标题不受影响", () => {
    const doc = createSharedDocument(article);
    try {
      const next = [
        { type: "paragraph", children: [{ type: "formatted", text: "本机离线改动" }] },
        { type: "paragraph", children: [{ type: "formatted", text: "第二段", bold: true }] },
      ];
      replaceSharedContent(doc, next as never);

      const shared = readSharedContent(doc);
      expect(shared.content).toMatchObject(next);
      expect(shared.title).toBe(article.title);
      // 远端视角：同一份状态读出的也是替换后的内容
      expect(readSharedContent(fork(doc)).content).toMatchObject(next);
    } finally {
      doc.destroy();
    }
  });

  it("整树替换应保留私有块占位并回填真身", () => {
    const privateNodes = new Map<string, never>();
    const doc = createSharedDocument(article, privateNodes);
    try {
      const next = [
        { type: "paragraph", children: [{ type: "formatted", text: "含私有块" }] },
        { type: "whiteboard", children: [{ type: "formatted", text: "" }] },
      ];
      replaceSharedContent(doc, next as never, privateNodes);

      // 云端（不传私有块）看到占位符，本机（传真身）还原为白板
      expect(readSharedContent(doc).content[1]).toMatchObject({
        type: "collaboration-placeholder",
      });
      expect(readSharedContent(doc, privateNodes).content[1]).toMatchObject({ type: "whiteboard" });
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

  it("投影时 activeKeyOverrides 应覆盖 tabs 激活态，失效覆盖回落第一个", () => {
    const paragraph = (text: string) => ({
      type: "paragraph",
      children: [{ type: "formatted", text }],
    });
    const doc = createSharedDocument({
      ...article,
      content: [
        {
          type: "tabs",
          activeKey: "a",
          children: [
            { type: "tab-pane", tabKey: "a", title: "A", children: [paragraph("内容 A")] },
            { type: "tab-pane", tabKey: "b", title: "B", children: [paragraph("内容 B")] },
          ],
        } as never,
      ],
    });
    try {
      const overrides = new Map([["whatever", "b"]]);
      // collabId 未知，覆盖无效：shared 模式 activeKey 被剥离，回落第一个
      const fallback = readSharedContent(doc, undefined, overrides);
      expect(fallback.content[0].activeKey).toBe("a");
      // 用树中 tabs 块真实 collabId 覆盖
      const tabsId = String(fallback.content[0].collabId);
      const applied = readSharedContent(doc, undefined, new Map([[tabsId, "b"]]));
      expect(applied.content[0].activeKey).toBe("b");
      // 覆盖值非法（pane 不存在）时回落
      const invalid = readSharedContent(doc, undefined, new Map([[tabsId, "gone"]]));
      expect(invalid.content[0].activeKey).toBe("a");
    } finally {
      doc.destroy();
    }
  });

  it("共享文档拒绝本地文件路径", () => {
    const doc = createSharedDocument({ ...article });
    doc.getMap("meta").set("bannerBg", "file:///etc/passwd");
    expect(() => validateDocument(doc)).toThrow("本地路径");
    doc.destroy();
  });

  it("仅本机资源引用只接受不透明标识，不能借前缀夹带本地路径", () => {
    const id = "0b5c6a3e-1f2d-4c5b-9a8e-7d6c5b4a3f21";
    expect(isSafeResource(`tau-collab-local:${id}`)).toBe(true);
    expect(isSafeResource("tau-collab-local:/Users/me/clip.mp4")).toBe(false);
    const doc = createSharedDocument({
      ...article,
      content: [{ type: "video", src: `tau-collab-local:${id}`, children: [{ text: "" }] }],
    });
    expect(() => validateDocument(doc)).not.toThrow();
    doc.destroy();
  });

  it("附件的本机路径字段同样受资源校验", () => {
    const doc = createSharedDocument({
      ...article,
      content: [
        {
          type: "file-attachment",
          filePath: "https://files.example/a.pdf",
          localFilePath: "/Users/me/a.pdf",
          children: [{ text: "" }],
        },
      ],
    });
    expect(() => validateDocument(doc)).toThrow("本地路径");
    doc.destroy();
  });
});
