import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../video-note-index-queue", () => ({
  default: {},
}));

vi.mock("../tables/operation", () => ({
  default: {
    insertOperation: vi.fn(),
  },
}));

vi.mock("electron-log", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { Role } from "@/constants";
import { CHAT_MESSAGE_SCHEMA_VERSION } from "@/services/chatMessageSchema";
import type { ChatSessionMessage } from "@/types";
import ChatMessageTable from "../tables/chat-message";
import PdfChatTable from "../tables/pdf-chat";
import VibeLearningChatTable from "../tables/vibe-learning-chat";
import VideoNoteChatTable from "../tables/video-note-chat";

const buildLegacyMessages = (): ChatSessionMessage[] =>
  [
    {
      role: Role.User,
      content: [{ type: "text", text: "你好" }],
    },
    {
      role: Role.Assistant,
      content: "最终答案",
      reasoning_content: "先思考",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"schema"}',
          },
        },
      ],
      tool_executions: [
        {
          toolCallId: "call-1",
          toolName: "search_docs",
          status: "success",
          input: '{"q":"schema"}',
          output: "搜索完成",
          timestamp: 1000,
        },
      ],
      content_blocks: [
        {
          type: "reasoning",
          content: "先思考",
          startTime: 1,
          endTime: 2,
          duration: 1,
        },
        {
          type: "tool_calls",
          executions: [
            {
              toolCallId: "call-1",
              toolName: "search_docs",
              status: "success",
              input: '{"q":"schema"}',
              output: "搜索完成",
              timestamp: 1000,
            },
          ],
        },
        {
          type: "text",
          content: "最终答案",
        },
      ],
    },
  ] as unknown as ChatSessionMessage[];

const buildCurrentMessages = (): ChatSessionMessage[] => [
  {
    role: Role.User,
    content: [{ type: "text", text: "你好" }],
  },
  {
    role: Role.Assistant,
    content: "最终答案",
    reasoning_content: "先思考",
    tool_calls: [
      {
        id: "call-1",
        type: "function",
        function: {
          name: "search_docs",
          arguments: '{"q":"schema"}',
        },
      },
    ],
    assistant_blocks: [
      {
        id: "turn-1:reasoning",
        turnId: "turn-1",
        type: "reasoning",
        state: "final",
        content: "先思考",
      },
      {
        id: "call-1",
        turnId: "turn-1",
        type: "tool_call",
        state: "final",
        toolCall: {
          id: "call-1",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"schema"}',
          },
        },
        execution: {
          toolCallId: "call-1",
          toolName: "search_docs",
          status: "success",
          input: '{"q":"schema"}',
          output: "搜索完成",
          timestamp: 1000,
        },
      },
      {
        id: "turn-1:text",
        turnId: "turn-1",
        type: "text",
        state: "final",
        content: "最终答案",
      },
    ],
  },
];

describe("chat message schema migration", () => {
  it("读取旧 chat_message 记录时会迁移 messages 并回写最新 schema version", () => {
    const updateRuns: unknown[][] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql === "SELECT * FROM chat_message WHERE id = ?") {
          return {
            get: () => ({
              id: 1,
              create_time: 1000,
              update_time: 1000,
              title: "旧对话",
              messages: JSON.stringify(buildLegacyMessages()),
              group_id: null,
              archived: 0,
              parent_chat_id: null,
              branch_index: 0,
              order_num: null,
              message_schema_version: 1,
            }),
          };
        }

        if (
          sql ===
          "UPDATE chat_message SET messages = ?, message_schema_version = ? WHERE id = ?"
        ) {
          return {
            run: (...args: unknown[]) => {
              updateRuns.push(args);
            },
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    } as any;

    const chat = ChatMessageTable.getChatMessageById(db, 1);
    const assistant = chat.messages[1] as unknown as Record<string, unknown>;

    expect(chat.messageSchemaVersion).toBe(CHAT_MESSAGE_SCHEMA_VERSION);
    expect(chat.titleDirty).toBe(true);
    expect(assistant.assistant_blocks).toBeTruthy();
    expect("tool_executions" in assistant).toBe(false);
    expect("content_blocks" in assistant).toBe(false);
    expect(updateRuns).toHaveLength(1);
    expect(updateRuns[0]?.[1]).toBe(CHAT_MESSAGE_SCHEMA_VERSION);
  });

  it("读取旧 chat_message 记录时默认使用本地代理", () => {
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql === "SELECT * FROM chat_message WHERE id = ?") {
          return {
            get: () => ({
              id: 1,
              create_time: 1000,
              update_time: 1000,
              title: "旧对话",
              messages: JSON.stringify(buildCurrentMessages()),
              group_id: null,
              archived: 0,
              parent_chat_id: null,
              branch_index: 0,
              order_num: null,
              message_schema_version: CHAT_MESSAGE_SCHEMA_VERSION,
              title_dirty: 1,
            }),
          };
        }

        if (
          sql ===
          "UPDATE chat_message SET messages = ?, message_schema_version = ? WHERE id = ?"
        ) {
          return {
            run: vi.fn(),
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    } as any;

    const chat = ChatMessageTable.getChatMessageById(db, 1);

    expect(chat.agentType).toBe("local");
    expect(chat.agentSessionId).toBeNull();
  });

  it("新建和更新 chat_message 时保存 Codex 代理会话信息", () => {
    const now = 1234;
    vi.spyOn(Date, "now").mockReturnValue(now);
    let storedRow: any = null;
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.startsWith("INSERT INTO chat_message")) {
          return {
            run: (...args: unknown[]) => {
              storedRow = {
                id: 1,
                create_time: args[0],
                update_time: args[1],
                title: args[2],
                messages: args[3],
                group_id: args[4],
                archived: 0,
                parent_chat_id: args[5],
                branch_index: args[6],
                order_num: args[7],
                message_schema_version: args[8],
                title_dirty: args[9],
                agent_type: args[10],
                agent_session_id: args[11],
              };
              return { lastInsertRowid: 1 };
            },
          };
        }

        if (sql === "SELECT * FROM chat_message WHERE id = ?") {
          return {
            get: () => storedRow,
          };
        }

        if (sql.startsWith("UPDATE chat_message SET update_time")) {
          return {
            run: (...args: unknown[]) => {
              storedRow = {
                ...storedRow,
                update_time: args[0],
                title: args[1],
                messages: args[2],
                group_id: args[3],
                archived: args[4],
                parent_chat_id: args[5],
                branch_index: args[6],
                order_num: args[7],
                message_schema_version: args[8],
                title_dirty: args[9],
                agent_type: args[10],
                agent_session_id: args[11],
              };
            },
          };
        }

        if (
          sql ===
          "UPDATE chat_message SET messages = ?, message_schema_version = ? WHERE id = ?"
        ) {
          return {
            run: vi.fn(),
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    } as any;

    const created = ChatMessageTable.createChatMessage(
      db,
      buildCurrentMessages(),
      "Codex 对话",
      null,
      null,
      0,
      null,
      false,
      "codex",
      "codex-thread-1",
    );

    expect(created.agentType).toBe("codex");
    expect(created.agentSessionId).toBe("codex-thread-1");

    const updated = ChatMessageTable.updateChatMessage(db, {
      ...created,
      agentSessionId: "codex-thread-2",
    });

    expect(updated.agentType).toBe("codex");
    expect(updated.agentSessionId).toBe("codex-thread-2");
  });

  it("新建和更新外部聊天记录时保存 Codex 代理会话信息", () => {
    const now = 2345;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const buildExternalDb = (
      tableName: "pdf_chats" | "video_note_chats" | "vibe_learning_chats",
      ownerColumn: "pdf_id" | "video_note_id" | "project_id",
      ownerId: number,
    ) => {
      let storedRow: any = null;
      return {
        prepare: vi.fn((sql: string) => {
          if (sql.includes(`INSERT INTO ${tableName}`)) {
            return {
              run: (...args: unknown[]) => {
                storedRow = {
                  id: ownerId,
                  [ownerColumn]: ownerId,
                  create_time: args[1],
                  update_time: args[2],
                  messages: args[3],
                  title: args[4],
                  archived: 0,
                  parent_chat_id: args[5],
                  branch_index: args[6],
                  message_schema_version: args[7],
                  agent_type: args[8],
                  agent_session_id: args[9],
                };
                return { lastInsertRowid: ownerId };
              },
            };
          }

          if (sql === `SELECT * FROM ${tableName} WHERE id = ?`) {
            return {
              get: () => storedRow,
            };
          }

          if (sql.includes("SELECT COALESCE(MAX(branch_index), -1) + 1")) {
            return {
              get: () => ({ next_index: 0 }),
            };
          }

          if (sql.trimStart().startsWith(`UPDATE ${tableName} SET`)) {
            return {
              run: (...args: unknown[]) => {
                storedRow = {
                  ...storedRow,
                  update_time: args[0],
                  messages: args[1],
                  title: args[2],
                  archived: args[3],
                  parent_chat_id: args[4],
                  branch_index: args[5],
                  message_schema_version: args[6],
                  agent_type: args[7],
                  agent_session_id: args[8],
                };
              },
            };
          }

          if (
            sql ===
            `UPDATE ${tableName} SET messages = ?, message_schema_version = ? WHERE id = ?`
          ) {
            return {
              run: vi.fn(),
            };
          }

          throw new Error(`Unexpected SQL: ${sql}`);
        }),
        transaction: vi.fn((fn: () => number) => fn),
      } as any;
    };

    const pdfDb = buildExternalDb("pdf_chats", "pdf_id", 10);
    const pdfChat = PdfChatTable.createChat(pdfDb, {
      pdfId: 10,
      messages: buildCurrentMessages(),
      title: "PDF Codex",
      agentType: "codex",
      agentSessionId: "pdf-thread-1",
    });
    const updatedPdfChat = PdfChatTable.updateChat(pdfDb, {
      ...pdfChat,
      agentSessionId: "pdf-thread-2",
    });

    const videoDb = buildExternalDb("video_note_chats", "video_note_id", 20);
    const videoChat = VideoNoteChatTable.createChat(videoDb, {
      videoNoteId: 20,
      messages: buildCurrentMessages(),
      title: "视频 Codex",
      agentType: "codex",
      agentSessionId: "video-thread-1",
    });
    const updatedVideoChat = VideoNoteChatTable.updateChat(videoDb, {
      ...videoChat,
      agentSessionId: "video-thread-2",
    });

    const vibeDb = buildExternalDb("vibe_learning_chats", "project_id", 30);
    const vibeChat = VibeLearningChatTable.createChat(vibeDb, {
      projectId: 30,
      messages: buildCurrentMessages(),
      title: "学习 Codex",
      agentType: "codex",
      agentSessionId: "vibe-thread-1",
    });
    const updatedVibeChat = VibeLearningChatTable.updateChat(vibeDb, {
      ...vibeChat,
      agentSessionId: "vibe-thread-2",
    });

    expect(pdfChat.agentType).toBe("codex");
    expect(pdfChat.agentSessionId).toBe("pdf-thread-1");
    expect(updatedPdfChat?.agentSessionId).toBe("pdf-thread-2");
    expect(videoChat.agentType).toBe("codex");
    expect(videoChat.agentSessionId).toBe("video-thread-1");
    expect(updatedVideoChat?.agentSessionId).toBe("video-thread-2");
    expect(vibeChat.agentType).toBe("codex");
    expect(vibeChat.agentSessionId).toBe("vibe-thread-1");
    expect(updatedVibeChat?.agentSessionId).toBe("vibe-thread-2");

    vi.restoreAllMocks();
  });

  it("更新外部聊天记录时支持显式清空 Codex 会话 ID", () => {
    const now = 3456;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const buildExternalDb = (
      tableName: "pdf_chats" | "video_note_chats" | "vibe_learning_chats",
      ownerColumn: "pdf_id" | "video_note_id" | "project_id",
      ownerId: number,
    ) => {
      let storedRow: any = {
        id: ownerId,
        [ownerColumn]: ownerId,
        create_time: now,
        update_time: now,
        messages: JSON.stringify(buildCurrentMessages()),
        title: "Codex 对话",
        archived: 0,
        parent_chat_id: null,
        branch_index: 0,
        message_schema_version: CHAT_MESSAGE_SCHEMA_VERSION,
        agent_type: "codex",
        agent_session_id: `${tableName}-thread`,
      };

      return {
        prepare: vi.fn((sql: string) => {
          if (sql === `SELECT * FROM ${tableName} WHERE id = ?`) {
            return {
              get: () => storedRow,
            };
          }

          if (sql.trimStart().startsWith(`UPDATE ${tableName} SET`)) {
            return {
              run: (...args: unknown[]) => {
                storedRow = {
                  ...storedRow,
                  update_time: args[0],
                  messages: args[1],
                  title: args[2],
                  archived: args[3],
                  parent_chat_id: args[4],
                  branch_index: args[5],
                  message_schema_version: args[6],
                  agent_type: args[7],
                  agent_session_id: args[8],
                };
              },
            };
          }

          if (
            sql ===
            `UPDATE ${tableName} SET messages = ?, message_schema_version = ? WHERE id = ?`
          ) {
            return {
              run: vi.fn(),
            };
          }

          throw new Error(`Unexpected SQL: ${sql}`);
        }),
      } as any;
    };

    const pdfChat = PdfChatTable.updateChat(
      buildExternalDb("pdf_chats", "pdf_id", 10),
      {
        id: 10,
        agentSessionId: null,
      },
    );
    const videoChat = VideoNoteChatTable.updateChat(
      buildExternalDb("video_note_chats", "video_note_id", 20),
      {
        id: 20,
        agentSessionId: null,
      },
    );
    const vibeChat = VibeLearningChatTable.updateChat(
      buildExternalDb("vibe_learning_chats", "project_id", 30),
      {
        id: 30,
        agentSessionId: null,
      },
    );

    expect(pdfChat?.agentSessionId).toBeNull();
    expect(videoChat?.agentSessionId).toBeNull();
    expect(vibeChat?.agentSessionId).toBeNull();

    vi.restoreAllMocks();
  });

  it("新建各类聊天记录时直接写入最新 schema version", () => {
    const now = 1234;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const rootChatInsertRuns: unknown[][] = [];
    const rootDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.startsWith("INSERT INTO chat_message")) {
          return {
            run: (...args: unknown[]) => {
              rootChatInsertRuns.push(args);
              return { lastInsertRowid: 1 };
            },
          };
        }

        if (sql === "SELECT * FROM chat_message WHERE id = ?") {
          return {
            get: () => ({
              id: 1,
              create_time: now,
              update_time: now,
              title: "主对话",
              messages: JSON.stringify(buildCurrentMessages()),
              group_id: null,
              archived: 0,
              parent_chat_id: null,
              branch_index: 0,
              order_num: null,
              message_schema_version: CHAT_MESSAGE_SCHEMA_VERSION,
              title_dirty: rootChatInsertRuns[0]?.[9],
            }),
          };
        }

        if (
          sql ===
          "UPDATE chat_message SET messages = ?, message_schema_version = ? WHERE id = ?"
        ) {
          return {
            run: vi.fn(),
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    } as any;

    const pdfInsertRuns: unknown[][] = [];
    const pdfDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("INSERT INTO pdf_chats")) {
          return {
            run: (...args: unknown[]) => {
              pdfInsertRuns.push(args);
              return { lastInsertRowid: 2 };
            },
          };
        }

        if (sql === "SELECT * FROM pdf_chats WHERE id = ?") {
          return {
            get: () => ({
              id: 2,
              pdf_id: 10,
              create_time: now,
              update_time: now,
              messages: JSON.stringify(buildCurrentMessages()),
              title: "PDF 对话",
              archived: 0,
              parent_chat_id: null,
              branch_index: 0,
              message_schema_version: CHAT_MESSAGE_SCHEMA_VERSION,
            }),
          };
        }

        if (sql.includes("SELECT COALESCE(MAX(branch_index), -1) + 1")) {
          return {
            get: () => ({ next_index: 0 }),
          };
        }

        if (
          sql ===
          "UPDATE pdf_chats SET messages = ?, message_schema_version = ? WHERE id = ?"
        ) {
          return {
            run: vi.fn(),
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      transaction: vi.fn((fn: () => number) => fn),
    } as any;

    const videoInsertRuns: unknown[][] = [];
    const videoDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("INSERT INTO video_note_chats")) {
          return {
            run: (...args: unknown[]) => {
              videoInsertRuns.push(args);
              return { lastInsertRowid: 3 };
            },
          };
        }

        if (sql === "SELECT * FROM video_note_chats WHERE id = ?") {
          return {
            get: () => ({
              id: 3,
              video_note_id: 20,
              create_time: now,
              update_time: now,
              messages: JSON.stringify(buildCurrentMessages()),
              title: "视频对话",
              archived: 0,
              parent_chat_id: null,
              branch_index: 0,
              message_schema_version: CHAT_MESSAGE_SCHEMA_VERSION,
            }),
          };
        }

        if (
          sql ===
          "UPDATE video_note_chats SET messages = ?, message_schema_version = ? WHERE id = ?"
        ) {
          return {
            run: vi.fn(),
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    } as any;

    const vibeInsertRuns: unknown[][] = [];
    const vibeDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("INSERT INTO vibe_learning_chats")) {
          return {
            run: (...args: unknown[]) => {
              vibeInsertRuns.push(args);
              return { lastInsertRowid: 4 };
            },
          };
        }

        if (sql === "SELECT * FROM vibe_learning_chats WHERE id = ?") {
          return {
            get: () => ({
              id: 4,
              project_id: 30,
              create_time: now,
              update_time: now,
              messages: JSON.stringify(buildCurrentMessages()),
              title: "学习对话",
              archived: 0,
              parent_chat_id: null,
              branch_index: 0,
              message_schema_version: CHAT_MESSAGE_SCHEMA_VERSION,
            }),
          };
        }

        if (
          sql ===
          "UPDATE vibe_learning_chats SET messages = ?, message_schema_version = ? WHERE id = ?"
        ) {
          return {
            run: vi.fn(),
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    } as any;

    const rootChat = ChatMessageTable.createChatMessage(
      rootDb,
      buildCurrentMessages(),
      "主对话",
      null,
      null,
      0,
      null,
    );
    const pdfChat = PdfChatTable.createChat(pdfDb, {
      pdfId: 10,
      messages: buildCurrentMessages(),
      title: "PDF 对话",
    });
    const videoNoteChat = VideoNoteChatTable.createChat(videoDb, {
      videoNoteId: 20,
      messages: buildCurrentMessages(),
      title: "视频对话",
    });
    const vibeLearningChat = VibeLearningChatTable.createChat(vibeDb, {
      projectId: 30,
      messages: buildCurrentMessages(),
      title: "学习对话",
    });

    expect(rootChat.messageSchemaVersion).toBe(CHAT_MESSAGE_SCHEMA_VERSION);
    expect(rootChat.titleDirty).toBe(false);
    expect(pdfChat.messageSchemaVersion).toBe(CHAT_MESSAGE_SCHEMA_VERSION);
    expect(videoNoteChat.messageSchemaVersion).toBe(
      CHAT_MESSAGE_SCHEMA_VERSION,
    );
    expect(vibeLearningChat.messageSchemaVersion).toBe(
      CHAT_MESSAGE_SCHEMA_VERSION,
    );
    expect(rootChatInsertRuns[0]?.[8]).toBe(CHAT_MESSAGE_SCHEMA_VERSION);
    expect(rootChatInsertRuns[0]?.[9]).toBe(0);
    expect(pdfInsertRuns[0]?.[7]).toBe(CHAT_MESSAGE_SCHEMA_VERSION);
    expect(videoInsertRuns[0]?.[7]).toBe(CHAT_MESSAGE_SCHEMA_VERSION);
    expect(vibeInsertRuns[0]?.[7]).toBe(CHAT_MESSAGE_SCHEMA_VERSION);

    vi.restoreAllMocks();
  });

  it("升级旧 chat_message 表时新增 title_dirty 并将历史对话锁定", () => {
    const execSql: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql === "PRAGMA table_info(chat_message)") {
          return {
            all: () => [
              { name: "id" },
              { name: "create_time" },
              { name: "update_time" },
              { name: "messages" },
              { name: "title" },
              { name: "group_id" },
              { name: "archived" },
              { name: "parent_chat_id" },
              { name: "branch_index" },
              { name: "order_num" },
              { name: "message_schema_version" },
            ],
          };
        }

        if (
          sql ===
          "UPDATE chat_message SET messages = ?, message_schema_version = ? WHERE id = ?"
        ) {
          return {
            run: vi.fn(),
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      exec: vi.fn((sql: string) => {
        execSql.push(sql);
      }),
    } as any;

    ChatMessageTable.upgradeTable(db);

    expect(execSql).toContain(
      "ALTER TABLE chat_message ADD COLUMN title_dirty INTEGER DEFAULT 1",
    );
    expect(execSql).toContain(
      "UPDATE chat_message SET title_dirty = 1 WHERE title_dirty IS NULL",
    );
  });

  it("更新 chat_message 时保留传入的 titleDirty 状态", () => {
    const now = 5678;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const updateRuns: unknown[][] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.startsWith("UPDATE chat_message SET update_time")) {
          return {
            run: (...args: unknown[]) => {
              updateRuns.push(args);
            },
          };
        }

        if (sql === "SELECT * FROM chat_message WHERE id = ?") {
          return {
            get: () => ({
              id: 1,
              create_time: 1000,
              update_time: now,
              title: "主对话",
              messages: JSON.stringify(buildCurrentMessages()),
              group_id: null,
              archived: 0,
              parent_chat_id: null,
              branch_index: 0,
              order_num: null,
              message_schema_version: CHAT_MESSAGE_SCHEMA_VERSION,
              title_dirty: updateRuns[0]?.[9],
            }),
          };
        }

        if (
          sql ===
          "UPDATE chat_message SET messages = ?, message_schema_version = ? WHERE id = ?"
        ) {
          return {
            run: vi.fn(),
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    } as any;

    const updatedChat = ChatMessageTable.updateChatMessage(db, {
      id: 1,
      createTime: 1000,
      title: "主对话",
      titleDirty: false,
      messages: buildCurrentMessages(),
      groupId: null,
      archived: false,
      parentChatId: null,
      branchIndex: 0,
      orderNum: null,
    });

    expect(updateRuns[0]?.[9]).toBe(0);
    expect(updatedChat.titleDirty).toBe(false);

    vi.restoreAllMocks();
  });
});
