import Database from "better-sqlite3";
import { ChatSessionMessage, ChatMessage } from "@/types";

export default class ChatMessageTable {
  static upgradeTable(db: Database.Database) {
    const tableInfo = db
      .prepare("PRAGMA table_info(chat_message)")
      .all() as Array<{ name: string }>;
    const hasGroupId = tableInfo.some((col) => col.name === "group_id");
    const hasArchived = tableInfo.some((col) => col.name === "archived");
    const hasParentChatId = tableInfo.some(
      (col) => col.name === "parent_chat_id",
    );
    const hasBranchIndex = tableInfo.some((col) => col.name === "branch_index");
    const hasOrderNum = tableInfo.some((col) => col.name === "order_num");

    if (!hasGroupId) {
      db.exec("ALTER TABLE chat_message ADD COLUMN group_id INTEGER");
    }

    if (!hasArchived) {
      db.exec("ALTER TABLE chat_message ADD COLUMN archived INTEGER DEFAULT 0");
    }

    if (!hasParentChatId) {
      db.exec("ALTER TABLE chat_message ADD COLUMN parent_chat_id INTEGER");
    }

    if (!hasBranchIndex) {
      db.exec(
        "ALTER TABLE chat_message ADD COLUMN branch_index INTEGER DEFAULT 0",
      );
    }

    if (!hasOrderNum) {
      db.exec("ALTER TABLE chat_message ADD COLUMN order_num INTEGER");
    }

    // 添加索引
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_chat_message_group_id ON chat_message(group_id)",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_chat_message_archived ON chat_message(archived)",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_chat_message_parent_chat_id ON chat_message(parent_chat_id)",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_chat_message_order_num ON chat_message(order_num)",
      );
    } catch (e) {
      // 索引可能已存在
    }
  }

  static getListenEvents() {
    return {
      "create-chat-message": this.createChatMessage.bind(this),
      "update-chat-message": this.updateChatMessage.bind(this),
      "delete-chat-message": this.deleteChatMessage.bind(this),
      "get-chat-message-by-id": this.getChatMessageById.bind(this),
      "get-all-chat-messages": this.getAllChatMessages.bind(this),
      "get-chat-branches": this.getBranchesByParentId.bind(this),
      "get-next-branch-index": this.getNextBranchIndex.bind(this),
      "get-child-branches-count": this.getChildBranchesCount.bind(this),
      "pin-chat-message": this.pinChatMessage.bind(this),
      "unpin-chat-message": this.unpinChatMessage.bind(this),
      "reorder-chat-message": this.reorderChatMessage.bind(this),
    };
  }

  static parseChatMessage(chatMessage: {
    id: number;
    create_time: number;
    update_time: number;
    title: string;
    messages: string;
    group_id: number | null;
    archived: number;
    parent_chat_id: number | null;
    branch_index: number | null;
    order_num: number | null;
  }): ChatMessage {
    return {
      id: Number(chatMessage.id),
      createTime: chatMessage.create_time,
      updateTime: chatMessage.update_time,
      title: chatMessage.title,
      messages: JSON.parse(chatMessage.messages),
      groupId: chatMessage.group_id,
      archived: Boolean(chatMessage.archived),
      parentChatId:
        chatMessage.parent_chat_id !== null
          ? Number(chatMessage.parent_chat_id)
          : null,
      branchIndex: chatMessage.branch_index ?? 0,
      orderNum: chatMessage.order_num ?? null,
    };
  }

  static createChatMessage(
    db: Database.Database,
    messages: ChatSessionMessage[],
    title: string,
    groupId: number | null | undefined,
    parentChatId: number | null | undefined,
    branchIndex: number | undefined,
    orderNum: number | null | undefined,
  ): ChatMessage {
    const stmt = db.prepare(
      "INSERT INTO chat_message (create_time, update_time, title, messages, group_id, archived, parent_chat_id, branch_index, order_num) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      title,
      JSON.stringify(messages),
      groupId ?? null,
      parentChatId ?? null,
      branchIndex ?? 0,
      orderNum ?? null,
    );
    const createdId = res.lastInsertRowid;
    return this.getChatMessageById(db, createdId);
  }

  static getChatMessageById(
    db: Database.Database,
    id: number | bigint,
  ): ChatMessage {
    const stmt = db.prepare("SELECT * FROM chat_message WHERE id = ?");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.parseChatMessage(stmt.get(id) as any);
  }

  static updateChatMessage(
    db: Database.Database,
    chatMessage: Omit<ChatMessage, "updateTime">,
  ): ChatMessage {
    const {
      id,
      title,
      messages,
      groupId,
      archived,
      parentChatId,
      branchIndex,
      orderNum,
    } = chatMessage;
    const stmt = db.prepare(
      "UPDATE chat_message SET update_time = ?, title = ?, messages = ?, group_id = ?, archived = ?, parent_chat_id = ?, branch_index = ?, order_num = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(
      now,
      title,
      JSON.stringify(messages),
      groupId ?? null,
      archived ? 1 : 0,
      parentChatId ?? null,
      branchIndex ?? 0,
      orderNum ?? null,
      id,
    );
    return this.getChatMessageById(db, id);
  }

  /**
   * 获取所有子分支的 ID（递归）
   */
  static getAllChildBranches(
    db: Database.Database,
    parentChatId: number,
  ): number[] {
    const stmt = db.prepare(`
      WITH RECURSIVE child_branches(id) AS (
        SELECT id FROM chat_message WHERE parent_chat_id = ?
        UNION ALL
        SELECT cm.id FROM chat_message cm
        JOIN child_branches cb ON cm.parent_chat_id = cb.id
      )
      SELECT id FROM child_branches
    `);
    const result = stmt.all(parentChatId) as Array<{ id: number }>;
    return result.map((row) => Number(row.id));
  }

  /**
   * 获取子分支数量（包括所有层级的子分支）
   */
  static getChildBranchesCount(
    db: Database.Database,
    parentChatId: number,
  ): number {
    const childIds = this.getAllChildBranches(db, parentChatId);
    return childIds.length;
  }

  /**
   * 删除对话（级联删除所有子分支）
   */
  static deleteChatMessage(db: Database.Database, id: number): number {
    // 先获取所有子分支的 ID
    const childIds = this.getAllChildBranches(db, id);

    // 删除所有子分支
    if (childIds.length > 0) {
      const placeholders = childIds.map(() => "?").join(",");
      const deleteChildrenStmt = db.prepare(
        `DELETE FROM chat_message WHERE id IN (${placeholders})`,
      );
      deleteChildrenStmt.run(...childIds);
    }

    // 删除父对话本身
    const stmt = db.prepare("DELETE FROM chat_message WHERE id = ?");
    const totalDeleted = stmt.run(id).changes + childIds.length;
    return totalDeleted;
  }

  static getAllChatMessages(db: Database.Database): ChatMessage[] {
    const stmt = db.prepare("SELECT * FROM chat_message");
    const chatMessages = stmt.all();
    return chatMessages.map((chatMessage) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.parseChatMessage(chatMessage as any),
    );
  }

  static getBranchesByParentId(
    db: Database.Database,
    parentChatId: number,
  ): ChatMessage[] {
    const stmt = db.prepare(
      "SELECT * FROM chat_message WHERE parent_chat_id = ? ORDER BY branch_index ASC",
    );
    const chatMessages = stmt.all(parentChatId);
    return chatMessages.map((chatMessage) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.parseChatMessage(chatMessage as any),
    );
  }

  static getNextBranchIndex(
    db: Database.Database,
    parentChatId: number,
  ): number {
    const stmt = db.prepare(
      "SELECT MAX(branch_index) as max_index FROM chat_message WHERE parent_chat_id = ?",
    );
    const result = stmt.get(parentChatId) as { max_index: number | null };
    return (result?.max_index ?? -1) + 1;
  }

  static pinChatMessage(db: Database.Database, chatId: number): ChatMessage {
    const chat = this.getChatMessageById(db, chatId);
    const groupId = chat.groupId;

    const nextOrderStmt = db.prepare(
      "SELECT MAX(order_num) as max_order FROM chat_message WHERE group_id IS ? AND order_num IS NOT NULL",
    );
    const result = nextOrderStmt.get(groupId) as { max_order: number | null };
    const nextOrder = (result?.max_order ?? -1) + 1;

    const stmt = db.prepare(
      "UPDATE chat_message SET order_num = ? WHERE id = ?",
    );
    stmt.run(nextOrder, chatId);

    return this.getChatMessageById(db, chatId);
  }

  static unpinChatMessage(db: Database.Database, chatId: number): ChatMessage {
    const stmt = db.prepare(
      "UPDATE chat_message SET order_num = NULL WHERE id = ?",
    );
    stmt.run(chatId);
    return this.getChatMessageById(db, chatId);
  }

  static reorderChatMessage(
    db: Database.Database,
    chatId: number,
    newOrder: number,
  ): ChatMessage {
    const stmt = db.prepare(
      "UPDATE chat_message SET order_num = ? WHERE id = ?",
    );
    stmt.run(newOrder, chatId);
    return this.getChatMessageById(db, chatId);
  }
}
