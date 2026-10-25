import { createSharedDocument } from "@tau/collaboration/src/testing/legacy-document";
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
import {
  readSharedContent,
  validateDocument,
  createNodeDocument,
  NodeTree,
  type ContentNode,
} from "@tau/collaboration";
import {
  prepareContentContract,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import { ContentDocumentTable } from "../../tables/content-document";
import { withNodeTree } from "@tau/editor-collab";
import {
  contentSession,
  patchSessionNodes,
  projectContentTitle,
  projectContractContent,
  readSessionContent,
  registerContentSession,
  unregisterContentSession,
} from "../content-sessions";
import type { RuntimeSession } from "../types";
import ContentTable from "../../tables/content";
import { createTaskIdPatcher } from "@tau/editor/extensions/list/task-ids";
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

async function nodeRuntime() {
  const contracts: Record<string, ContentContractDictionary[string]> = {};
  const ids = new Map<string, string>();
  for (const type of ["check-list", "check-list-item", "paragraph", "link", "source"]) {
    const prepared = await prepareContentContract(`host.${type}`, {
      type,
      dataVersion: 1,
      kind: type === "link" ? "inline" : "block",
      collaboration: type === "source" ? { textFields: ["code"] } : undefined,
    });
    contracts[prepared.id] = prepared.contract;
    ids.set(type, prepared.id);
  }
  const node = (
    type: string,
    collabId: string,
    children: ContentNode[],
    extra = {}
  ): ContentNode => ({ type, collabId, tauContract: ids.get(type)!, children, ...extra });
  const content = [
    node("check-list", "list", [
      node("check-list-item", "item", [
        node("paragraph", "p", [
          { text: "前 #发布 ", bold: true },
          node("link", "link", [{ text: "中间" }], { url: "https://example.com" }),
          { text: " 后 #发布", italic: true },
        ]),
      ]),
    ]),
    node("source", "source", [{ text: "" }], { code: "源码" }),
  ];
  const session = runtime();
  session.doc = await createNodeDocument(
    { documentId: session.info.id, baselineId: "baseline", epoch: 0 },
    { title: "标题", bannerBg: "", bannerPosition: "center", content },
    contracts
  );
  session.persistNodeUpdate = vi.fn();
  cleanup.push(() => session.doc.destroy());
  return { session, contracts };
}

describe("本机内容会话", () => {
  it("新格式经实际读取、宿主补丁和主库投影保存，重复投影不产生写入", async () => {
    const db = database();
    const { session, contracts } = await nodeRuntime();
    registerContentSession(db, 7, session);
    const initial = ContentDocumentTable.commit(
      db,
      7,
      {
        documentId: "stable-body",
        contracts,
        content: readSessionContent(session).content,
      },
      { count: 0, installDocument: true }
    );
    expect(ContentTable.ensureTaskIds(db, 7)).toBe(1);
    const first = ContentTable.getContentById(db, 7)!;
    expect(first.content[0]).toMatchObject({ children: [{ taskId: expect.any(String) }] });
    expect(
      patchSessionNodes(
        session,
        () => null,
        undefined,
        text =>
          [...text.matchAll(/#发布/g)].map(match => ({
            index: match.index! + 1,
            remove: 2,
            insert: "上线",
          }))
      )
    ).toBe(2);
    const projected = { ...initial, content: readSessionContent(session).content };
    expect(
      projectContractContent(db, session.info.source!, session, projected, initial.revision, 12)
    ).toBe(true);
    const stored = ContentDocumentTable.read(db, 7)!;
    expect(stored.content).toEqual(ContentTable.getContentById(db, 7)!.content);
    expect(JSON.stringify(stored.content)).toContain("#上线");
    expect(
      projectContractContent(db, session.info.source!, session, stored, stored.revision, 12)
    ).toBe(false);
    expect(
      db.prepare("SELECT * FROM operation WHERE operation_content_type='content'").all()
    ).toHaveLength(1);
    expect(() =>
      projectContractContent(db, session.info.source!, session, initial, initial.revision, 0)
    ).toThrow("修订已变化");
  });

  it("宿主补丁与远端拆段输入合并，坏补丁和磁盘失败不留下半次修改", async () => {
    const { session } = await nodeRuntime();
    const peer = new NodeTree(new Y.Doc());
    Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(session.doc));
    cleanup.push(() => {
      peer.dispose();
      peer.doc.destroy();
    });
    peer.insertText("p", 1, "远端", null);
    patchSessionNodes(session, attrs =>
      attrs.type === "check-list-item" ? { checked: true } : null
    );
    Y.applyUpdate(session.doc, Y.encodeStateAsUpdate(peer.doc));
    const before = Y.encodeStateAsUpdate(session.doc);
    expect(JSON.stringify(readSessionContent(session))).toContain("远端");
    expect(() =>
      patchSessionNodes(session, attrs =>
        attrs.type === "source" ? { code: "覆盖源码" } : { custom: "未完成" }
      )
    ).toThrow("文本字段");
    expect(Y.encodeStateAsUpdate(session.doc)).toEqual(before);
    session.persistNodeUpdate = () => {
      throw new Error("磁盘满");
    };
    expect(() => patchSessionNodes(session, () => ({ custom: "丢失" }))).toThrow("磁盘满");
    expect(Y.encodeStateAsUpdate(session.doc)).toEqual(before);
    expect(() =>
      projectContractContent(
        database(),
        session.info.source!,
        session,
        { documentId: "body", contracts: {}, content: [] },
        "missing",
        0
      )
    ).toThrow("尚未安装");
  });
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

  it("冻结会话补身份会暂缓，不影响已有输入更新", async () => {
    const db = database();
    const { session } = await nodeRuntime();
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

  it("多视图并发输入和撤销保持收敛，关闭一个视图只移除自己的光标", async () => {
    const { session: main } = await nodeRuntime();
    const views = [1, 2].map(() => {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(main.doc));
      const awareness = new Awareness(doc);
      const tree = new NodeTree(doc);
      const base = createEditor();
      base.isInline = element => element.type === "link";
      base.isVoid = element => String(element.type) === "source";
      const editor = withNodeTree(base, tree, {});
      editor.connectNodeTree();
      cleanup.push(() => {
        editor.disposeNodeTree();
        tree.dispose();
        awareness.destroy();
        doc.destroy();
      });
      return { doc, awareness, editor };
    });
    for (const [index, view] of views.entries()) {
      Transforms.insertText(view.editor, index ? "乙" : "甲", {
        at: { path: [0, 0, 0, 0], offset: 1 },
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
    expect(new NodeTree(views[0].doc).read()).toEqual(new NodeTree(views[1].doc).read());
    views[0].editor.undo();
    Y.applyUpdate(main.doc, Y.encodeStateAsUpdate(views[0].doc));
    expect(JSON.stringify(readSessionContent(main))).toContain("乙");
    expect(JSON.stringify(readSessionContent(main))).not.toContain("甲");
    removeAwarenessStates(main.awareness, [views[0].doc.clientID], "window-closed");
    expect(main.awareness.getStates().has(views[1].doc.clientID)).toBe(true);
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

  it("按创建标识校验，删除后同号重建不能继承旧会话", () => {
    const db = database();
    const session = runtime();
    registerContentSession(db, 7, session);
    expect(contentSession(db, 7)).toBe(session);
    db.exec("UPDATE contents SET create_time=200 WHERE id=7");
    expect(contentSession(db, 7)).toBeUndefined();
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
