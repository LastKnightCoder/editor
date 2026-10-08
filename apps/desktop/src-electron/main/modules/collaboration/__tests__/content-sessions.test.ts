import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
import Database from "better-sqlite3";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { createEditor, Transforms } from "slate";
import { YjsEditor } from "@slate-yjs/core";
import { createSharedDocument, readSharedContent, validateDocument } from "@tau/collaboration";
import { withCollaboration } from "@tau/editor-collab";
import {
  contentRevision,
  contentSession,
  patchSessionNodes,
  projectContentTitle,
  projectLocalContent,
  registerContentSession,
  replaceSessionContent,
  unregisterContentSession,
} from "../content-sessions";
import type { RuntimeSession } from "../types";
import ContentTable from "../../tables/content";
import { createTaskIdPatcher } from "@tau/editor-list/task-ids";
import MAIN_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/main.sql?raw";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose();
});
function runtime(content?: unknown[]): RuntimeSession {
  const doc = createSharedDocument(
    {
      title: "标题",
      content: (content as never) ?? [
        { type: "paragraph", children: [{ text: "你好" }] },
        { type: "whiteboard", whiteBoardContentId: 12, children: [{ text: "" }] },
        { type: "image", url: "/tmp/local.png", children: [{ text: "" }] },
      ],
      bannerBg: "",
      bannerPosition: "center",
    },
    undefined,
    "local"
  );
  const awareness = new Awareness(doc);
  awareness.setLocalState(null);
  const session: RuntimeSession = {
    doc,
    awareness,
    privateNodes: new Map(),
    viewActiveTabs: new Map(),
    dirty: false,
    info: {
      id: "local-test",
      mode: "local",
      title: "标题",
      ownerId: "device",
      role: "owner",
      status: "active",
      members: [],
      updatedAt: 1,
      serverUrl: "",
      connection: "connected",
      pending: false,
      leaving: false,
      source: { databaseName: "test", contentId: 7, contentCreatedAt: 100 },
    },
  };
  cleanup.push(() => {
    unregisterContentSession(session);
    awareness.destroy();
    doc.destroy();
  });
  return session;
}
function database() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content) VALUES (7,100,100,'[]')"
  ).run();
  cleanup.push(() => db.close());
  return db;
}

describe("本机内容会话", () => {
  it("缺失身份的离线分叉得到相同 taskId，合并后身份不会换成另一随机值", () => {
    const main = runtime([
      {
        type: "check-list",
        children: [
          {
            type: "check-list-item",
            checked: false,
            children: [{ type: "paragraph", children: [{ text: "任务" }] }],
          },
        ],
      },
    ]);
    const view = new Y.Doc();
    Y.applyUpdate(view, Y.encodeStateAsUpdate(main.doc));
    const other = { ...main, doc: view } as RuntimeSession;
    patchSessionNodes(main, createTaskIdPatcher());
    patchSessionNodes(other, createTaskIdPatcher());
    const taskId = (readSharedContent(main.doc).content[0].children![0] as { taskId: string })
      .taskId;
    expect((readSharedContent(view).content[0].children![0] as { taskId: string }).taskId).toBe(
      taskId
    );
    Y.applyUpdate(main.doc, Y.encodeStateAsUpdate(view));
    Y.applyUpdate(view, Y.encodeStateAsUpdate(main.doc));
    expect((readSharedContent(main.doc).content[0].children![0] as { taskId: string }).taskId).toBe(
      taskId
    );
    view.destroy();
  });

  it("格式和行内元素混排的全段补丁按正确偏移修改", () => {
    const main = runtime([
      {
        type: "paragraph",
        children: [
          { text: "前 #发布 ", bold: true },
          { type: "link", url: "https://example.com", children: [{ text: "中间" }] },
          { text: " 后 #发布", italic: true },
        ],
      },
    ]);
    patchSessionNodes(
      main,
      () => null,
      undefined,
      text =>
        [...text.matchAll(/#发布/g)].map(match => ({
          index: match.index! + 1,
          remove: 2,
          insert: "上线",
        }))
    );
    expect(readSharedContent(main.doc).content[0]).toMatchObject({
      children: [
        { text: "前 #上线 ", bold: true },
        { type: "link", children: [{ text: "中间" }] },
        { text: " 后 #上线", italic: true },
      ],
    });
  });

  it("冻结会话补身份会暂缓，不影响已有输入更新", () => {
    const db = database();
    const session = runtime([
      {
        type: "check-list",
        children: [
          {
            type: "check-list-item",
            checked: false,
            children: [{ type: "paragraph", children: [{ text: "任务" }] }],
          },
        ],
      },
    ]);
    registerContentSession(db, 7, session);
    session.info.frozen = true;
    expect(ContentTable.ensureTaskIds(db, 7)).toBe(0);
    session.info.frozen = false;
    expect(ContentTable.ensureTaskIds(db, 7)).toBe(1);
  });
  it("编辑期间不自动改日期文字，退出编辑后再就地写回", () => {
    const db = database();
    const session = runtime([{ type: "paragraph", children: [{ text: "明天" }] }]);
    registerContentSession(db, 7, session);
    session.awareness.setLocalState({ activity: "editing" });
    const options = {
      canonical: true,
      paragraph: () => [{ index: 0, remove: 2, insert: "2026年10月9日" }],
    };
    expect(ContentTable.patchNodes(db, 7, () => null, options)).toBe(0);
    expect(readSharedContent(session.doc).content[0]).toMatchObject({
      children: [{ text: "明天" }],
    });
    session.awareness.setLocalState({ activity: "viewing" });
    expect(ContentTable.patchNodes(db, 7, () => null, options)).toBe(1);
    expect(readSharedContent(session.doc).content[0]).toMatchObject({
      children: [{ text: "2026年10月9日" }],
    });
  });
  it("保留本地实体和资源，但禁止直接上传本机文档", () => {
    const { doc } = runtime();
    const content = readSharedContent(doc).content;
    expect(content[1].whiteBoardContentId).toBe(12);
    expect(content[2].url).toBe("/tmp/local.png");
    expect(() => validateDocument(doc)).toThrow("本机会话");
  });

  it("多视图并发输入和撤销保持收敛，关闭一个视图只移除自己的光标", () => {
    const main = runtime();
    const views = [1, 2].map(() => {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(main.doc));
      const awareness = new Awareness(doc);
      const editor = withCollaboration(createEditor(), {
        doc,
        awareness,
        origin: {},
        mode: "local",
        privateNodes: new Map(),
        uploadResource: async () => "",
        resolveResource: async url => url,
      });
      YjsEditor.connect(editor);
      cleanup.push(() => {
        YjsEditor.disconnect(editor);
        awareness.destroy();
        doc.destroy();
      });
      return { doc, awareness, editor };
    });
    for (const [index, view] of views.entries()) {
      Transforms.insertText(view.editor, index ? "乙" : "甲", { at: { path: [0, 0], offset: 1 } });
      YjsEditor.flushLocalChanges(view.editor);
      view.editor.sendCursorPosition({
        anchor: { path: [0, 0], offset: 1 },
        focus: { path: [0, 0], offset: 1 },
      });
      view.awareness.setLocalStateField("user", { id: "same-device", viewId: String(index) });
      applyAwarenessUpdate(
        main.awareness,
        encodeAwarenessUpdate(view.awareness, [view.doc.clientID]),
        "ipc"
      );
      Y.applyUpdate(main.doc, Y.encodeStateAsUpdate(view.doc), "ipc");
    }
    for (const view of views) Y.applyUpdate(view.doc, Y.encodeStateAsUpdate(main.doc), "ipc");
    expect(readSharedContent(views[0].doc)).toEqual(readSharedContent(views[1].doc));
    views[0].editor.undo();
    YjsEditor.flushLocalChanges(views[0].editor);
    Y.applyUpdate(main.doc, Y.encodeStateAsUpdate(views[0].doc));
    expect(JSON.stringify(readSharedContent(main.doc))).toContain("乙");
    expect(JSON.stringify(readSharedContent(main.doc))).not.toContain("甲");
    views[0].editor.sendCursorPosition(null);
    expect(views[0].awareness.getLocalState()?.selection).toBeTruthy();
    removeAwarenessStates(main.awareness, [views[0].doc.clientID], "window-closed");
    expect(main.awareness.getStates().has(views[1].doc.clientID)).toBe(true);
  });

  it("整篇替换必须携带当前版本，冲突和冻结不会修改内容", () => {
    const session = runtime();
    const revision = contentRevision(session);
    const replacement = [{ type: "paragraph", children: [{ text: "替换正文" }] }];
    expect(() => replaceSessionContent(session, replacement)).toThrow("VERSION_CONFLICT");
    session.doc.getText("title").insert(0, "新");
    expect(() => replaceSessionContent(session, replacement, revision)).toThrow("VERSION_CONFLICT");
    session.info.frozen = true;
    expect(() => replaceSessionContent(session, replacement, contentRevision(session))).toThrow(
      "LOCKED"
    );
    session.info.frozen = false;
    replaceSessionContent(session, replacement, contentRevision(session));
    expect(JSON.stringify(readSharedContent(session.doc))).toContain("替换正文");
    expect(readSharedContent(session.doc).title).toBe("新标题");
  });

  it("整篇替换保留嵌套节点属性、格式与源码，并同步到已连接的编辑器", () => {
    const session = runtime();
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(session.doc));
    const awareness = new Awareness(doc);
    const editor = withCollaboration(createEditor(), {
      doc,
      awareness,
      origin: {},
      mode: "local",
      privateNodes: new Map(),
      uploadResource: async () => "",
      resolveResource: async url => url,
    });
    YjsEditor.connect(editor);
    cleanup.push(() => {
      YjsEditor.disconnect(editor);
      awareness.destroy();
      doc.destroy();
    });
    const replacement = [
      { type: "header", level: 2, children: [{ type: "formatted", text: "标题" }] },
      {
        type: "blockquote",
        children: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "加粗正文", bold: true }],
          },
        ],
      },
      { type: "code-block", language: "js", code: "const count = 1;", children: [{ text: "" }] },
      { type: "image", url: "/tmp/new.png", children: [{ text: "" }] },
    ];
    replaceSessionContent(session, replacement, contentRevision(session));
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(session.doc), "ipc");

    expect(readSharedContent(session.doc).content).toMatchObject(replacement);
    expect(readSharedContent(doc)).toEqual(readSharedContent(session.doc));
    expect(editor.children.slice(0, 2)).toMatchObject(replacement.slice(0, 2));
    expect(editor.children[2]).toMatchObject({ type: "code-block", language: "js" });
    expect(editor.children[3]).toMatchObject(replacement[3]);
    Transforms.insertText(editor, "新", { at: { path: [0, 0], offset: 0 } });
    YjsEditor.flushLocalChanges(editor);
    Y.applyUpdate(session.doc, Y.encodeStateAsUpdate(doc), "ipc");
    expect(readSharedContent(session.doc).content[0]).toMatchObject({
      type: "header",
      children: [{ text: "新标题" }],
    });
  });

  it("共享正文替换保留私有块占位和本机真实节点", () => {
    const session = runtime();
    session.info.mode = "shared";
    session.doc.getMap("meta").set("mode", "shared");
    const replacement = [
      { type: "paragraph", children: [{ text: "共享正文" }] },
      {
        type: "whiteboard",
        collabId: "private-board",
        whiteBoardContentId: 42,
        children: [{ text: "" }],
      },
    ];
    replaceSessionContent(session, replacement, contentRevision(session));

    expect(() => validateDocument(session.doc)).not.toThrow();
    expect(readSharedContent(session.doc).content[1]).toMatchObject({
      type: "collaboration-placeholder",
      collabId: "private-board",
      label: "whiteboard",
    });
    expect(readSharedContent(session.doc, session.privateNodes).content).toMatchObject(replacement);
  });

  it("标题回写所有文档类型，保留标签封面和卡片", () => {
    const db = database();
    db.exec(
      "INSERT INTO articles(id,title,create_time,update_time,content_id,tags,banner_bg) VALUES (1,'文章',1,1,7,'[\"标签\"]','cover'); INSERT INTO project_item(id,title,create_time,update_time,content_id) VALUES (2,'项目',1,1,7); INSERT INTO project_item(id,title,create_time,update_time,content_id,tags) VALUES (3,'知识库',1,1,7,'[\"知识库标签\"]'); INSERT INTO cards(id,create_time,update_time,content_id,tags) VALUES (4,1,1,7,'[\"卡片标签\"]');"
    );
    expect(projectContentTitle(db, 7, "统一标题")).toHaveLength(3);
    for (const table of ["articles", "project_item"])
      expect(db.prepare(`SELECT title FROM ${table}`).get()).toEqual({ title: "统一标题" });
    expect(db.prepare("SELECT tags,banner_bg FROM articles").get()).toEqual({
      tags: '["标签"]',
      banner_bg: "cover",
    });
    expect(db.prepare("SELECT tags FROM cards").get()).toEqual({ tags: '["卡片标签"]' });
    expect(projectContentTitle(db, 7, "统一标题")).toHaveLength(0);
  });

  it("纯删除也改变版本，不能通过旧版本覆盖删除操作", () => {
    const session = runtime();
    const revision = contentRevision(session);
    session.doc.getText("title").delete(0, 1);
    expect(contentRevision(session)).not.toBe(revision);
    expect(() => replaceSessionContent(session, [], revision)).toThrow("VERSION_CONFLICT");
  });

  it("回写按创建标识校验，删除后同号重建不能继承旧会话", () => {
    const db = database();
    const session = runtime();
    registerContentSession(db, 7, session);
    expect(contentSession(db, 7)).toBe(session);
    expect(
      projectLocalContent(db, session.info.source!, readSharedContent(session.doc).content, 2)
    ).toBe(true);
    db.exec("UPDATE contents SET create_time=200 WHERE id=7");
    expect(contentSession(db, 7)).toBeUndefined();
    expect(() => projectLocalContent(db, session.info.source!, [], 0)).toThrow("关联已变化");
  });

  it("按属性就地修改嵌套元素，与视图里并发的输入合并、不整篇替换", () => {
    const item = (taskId: string, text: string) => ({
      type: "check-list-item",
      checked: false,
      taskId,
      children: [{ type: "paragraph", children: [{ text }] }],
    });
    const main = runtime([{ type: "check-list", children: [item("a", "甲"), item("b", "乙")] }]);

    // 视图端在补丁之前分叉，随后在第一项的文字里输入
    const view = new Y.Doc();
    Y.applyUpdate(view, Y.encodeStateAsUpdate(main.doc));
    // 找到第一个段落元素（承载文字的 XmlText）
    const firstParagraph = (text: Y.XmlText): Y.XmlText | null => {
      for (const part of text.toDelta() as Array<{ insert: unknown }>) {
        if (!(part.insert instanceof Y.XmlText)) continue;
        if (part.insert.getAttribute("type") === "paragraph") return part.insert;
        const found = firstParagraph(part.insert);
        if (found) return found;
      }
      return null;
    };
    firstParagraph(view.get("content", Y.XmlText))!.insert(1, "改");

    const body = main.doc.get("content", Y.XmlText);
    const listBefore = body.toDelta()[0].insert;
    expect(
      patchSessionNodes(main, attrs =>
        attrs.type === "check-list-item" && attrs.taskId === "b" ? { checked: true } : null
      )
    ).toBe(1);
    // 原元素仍在原位（就地改属性，不是删了重插）
    expect(body.toDelta()[0].insert).toBe(listBefore);

    Y.applyUpdate(main.doc, Y.encodeStateAsUpdate(view));
    Y.applyUpdate(view, Y.encodeStateAsUpdate(main.doc));
    for (const doc of [main.doc, view]) {
      const [list] = readSharedContent(doc).content as Array<{ children: any[] }>;
      expect(list.children.map(child => [child.taskId, child.checked])).toEqual([
        ["a", false],
        ["b", true],
      ]);
      expect(list.children[0].children[0].children[0].text).toBe("甲改");
    }
    view.destroy();
  });

  it("会话冻结时拒绝属性修改", () => {
    const session = runtime();
    session.info.frozen = true;
    expect(() => patchSessionNodes(session, () => ({ checked: true }))).toThrow("LOCKED");
  });
});
