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

    expect(chat.messageSchemaVersion).toBe(2);
    expect(assistant.assistant_blocks).toBeTruthy();
    expect("tool_executions" in assistant).toBe(false);
    expect("content_blocks" in assistant).toBe(false);
    expect(updateRuns).toHaveLength(1);
    expect(updateRuns[0]?.[1]).toBe(2);
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
              message_schema_version: 2,
            }),
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
              message_schema_version: 2,
            }),
          };
        }

        if (sql.includes("SELECT COALESCE(MAX(branch_index), -1) + 1")) {
          return {
            get: () => ({ next_index: 0 }),
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
              message_schema_version: 2,
            }),
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
              message_schema_version: 2,
            }),
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

    expect(rootChat.messageSchemaVersion).toBe(2);
    expect(pdfChat.messageSchemaVersion).toBe(2);
    expect(videoNoteChat.messageSchemaVersion).toBe(2);
    expect(vibeLearningChat.messageSchemaVersion).toBe(2);
    expect(rootChatInsertRuns[0]?.[8]).toBe(2);
    expect(pdfInsertRuns[0]?.[7]).toBe(2);
    expect(videoInsertRuns[0]?.[7]).toBe(2);
    expect(vibeInsertRuns[0]?.[7]).toBe(2);

    vi.restoreAllMocks();
  });
});
