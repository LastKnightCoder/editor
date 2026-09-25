import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MAIN_SCHEMA_SQL from "@tau/db-schema/schema/main.sql?raw";
import { Role } from "@/constants";
import { CHAT_MESSAGE_SCHEMA_VERSION } from "@/services/chatMessageSchema";
import ChatMessageTable from "../tables/chat-message";

let nativeAvailable = true;
try {
  const probe = new Database(":memory:");
  probe.close();
} catch {
  nativeAvailable = false;
}

// 用真实 SQLite 校验 INSERT 的列数与占位符数一致（mock db 测不出这类错误）
describe.skipIf(!nativeAvailable)("ChatMessageTable.createChatMessage", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    ChatMessageTable.upgradeTable(db);
  });

  afterEach(() => db.close());

  it("新建会话写入全部字段并可读回", () => {
    const created = ChatMessageTable.createChatMessage(
      db,
      [{ role: Role.User, content: "你好" }],
      "新对话",
      null,
      null,
      undefined,
      null,
      true
    );

    expect(created).toMatchObject({
      title: "新对话",
      titleDirty: true,
      groupId: null,
      archived: false,
      parentChatId: null,
      branchIndex: 0,
      orderNum: null,
      messageSchemaVersion: CHAT_MESSAGE_SCHEMA_VERSION,
    });
    expect(created.messages).toHaveLength(1);
    expect(ChatMessageTable.getAllChatMessages(db).map(chat => chat.id)).toEqual([created.id]);
  });

  it("分支会话保留父会话、分支序号与排序", () => {
    const root = ChatMessageTable.createChatMessage(db, [], "根", null, null, undefined, null);
    const branch = ChatMessageTable.createChatMessage(db, [], "分支", null, root.id, 2, 5);

    expect(branch).toMatchObject({
      parentChatId: root.id,
      branchIndex: 2,
      orderNum: 5,
      titleDirty: false,
    });
  });
});
