/**
 * pi 会话目录表（M4）：按场景过滤、置顶排序、分支子树级联删除、部分更新。
 */
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ChatSessionTable from "../tables/chat-session";

let nativeAvailable = true;
try {
  const probe = new Database(":memory:");
  probe.close();
} catch {
  nativeAvailable = false;
}

describe.skipIf(!nativeAvailable)("ChatSessionTable", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    ChatSessionTable.upgradeTable(db);
  });

  afterEach(() => db.close());

  const create = (id: string, extra: Record<string, unknown> = {}) =>
    ChatSessionTable.create(db, {
      id,
      scope: "main-chat",
      sessionFile: `${id}.jsonl`,
      title: id,
      ...extra,
    });

  it("按场景与所属对象过滤，主聊天与 PDF 对话互不串", () => {
    create("main-1");
    create("pdf-a-1", { scope: "pdf-chat", domainRef: "7" });
    create("pdf-b-1", { scope: "pdf-chat", domainRef: "8" });

    expect(ChatSessionTable.list(db, { scope: "main-chat" }).map(row => row.id)).toEqual([
      "main-1",
    ]);
    expect(
      ChatSessionTable.list(db, { scope: "pdf-chat", domainRef: "7" }).map(row => row.id)
    ).toEqual(["pdf-a-1"]);
    expect(
      ChatSessionTable.list(db, { scope: "main-chat", domainRef: null }).map(row => row.id)
    ).toEqual(["main-1"]);
  });

  it("置顶在前（按置顶顺序），其余按最近更新降序；归档与分支默认不出现", () => {
    create("old", { updateTime: 1, createTime: 1 });
    create("new", { updateTime: 3, createTime: 3 });
    create("pinned", { updateTime: 2, createTime: 2 });
    create("archived", { archived: true, updateTime: 9, createTime: 9 });
    create("branch", { parentSessionId: "old", branchIndex: 1, updateTime: 8, createTime: 8 });
    ChatSessionTable.pin(db, "pinned");

    expect(ChatSessionTable.list(db, { scope: "main-chat" }).map(row => row.id)).toEqual([
      "pinned",
      "new",
      "old",
    ]);
    expect(
      ChatSessionTable.list(db, { scope: "main-chat", includeArchived: true }).map(row => row.id)
    ).toContain("archived");
  });

  it("置顶序号在同场景同对象内递增，取消置顶清空", () => {
    create("a");
    create("b");
    create("pdf", { scope: "pdf-chat", domainRef: "7" });
    expect(ChatSessionTable.pin(db, "a")?.orderNum).toBe(1);
    expect(ChatSessionTable.pin(db, "b")?.orderNum).toBe(2);
    // 另一个场景的置顶序号独立
    expect(ChatSessionTable.pin(db, "pdf")?.orderNum).toBe(1);
    expect(ChatSessionTable.unpin(db, "a")?.orderNum).toBeNull();
  });

  it("部分更新只写传入字段", () => {
    create("s", { groupId: 3, title: "原标题" });
    const updated = ChatSessionTable.update(db, "s", { title: "新标题", titleDirty: true });
    expect(updated).toMatchObject({ title: "新标题", titleDirty: true, groupId: 3 });
  });

  it("删除级联分支子树并返回全部被删 id", () => {
    create("root");
    create("child", { parentSessionId: "root", branchIndex: 1 });
    create("grandchild", { parentSessionId: "child", branchIndex: 1 });
    expect(ChatSessionTable.nextBranchIndex(db, "root")).toBe(2);

    const { deletedIds } = ChatSessionTable.remove(db, "root");
    expect(deletedIds.sort()).toEqual(["child", "grandchild", "root"]);
    expect(ChatSessionTable.getById(db, "child")).toBeNull();
  });
});
