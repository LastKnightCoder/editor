import { describe, expect, it } from "vitest";
import type { ChatSessionRow } from "@/types/chat-session";
import { navSessions, parseChatId } from "../model";

/** 目录行（id 用 `chat-<n>` 形状；updateTime 取序号，越大越新） */
const chat = (n: number, patch: Partial<ChatSessionRow> = {}): ChatSessionRow => ({
  id: `chat-${n}`,
  scope: "main-chat",
  domainRef: null,
  sessionFile: `f_chat-${n}.jsonl`,
  cwd: "",
  title: `对话 ${n}`,
  titleDirty: false,
  groupId: null,
  orderNum: null,
  archived: false,
  source: "desktop",
  messageCount: 1,
  createTime: 0,
  updateTime: n,
  ...patch,
});
const ids = (rows: ChatSessionRow[]) => rows.map(row => row.id);

describe("parseChatId", () => {
  it("接受 pi 会话 id，旧版本的数字 id 与非法值按新对话处理", () => {
    const id = "0b9f3c3e-6a8f-4d3a-9d7e-2f1a0c9b8e7d";
    expect(parseChatId(id)).toBe(id);
    expect(parseChatId("12")).toBeNull();
    expect(parseChatId(undefined)).toBeNull();
    expect(parseChatId("../etc")).toBeNull();
    expect(parseChatId("abc")).toBeNull();
  });
});

describe("navSessions", () => {
  it("置顶按 orderNum 排序，最近取更新时间最新的 3 条", () => {
    const chats = [
      chat(1),
      chat(2, { orderNum: 2 }),
      chat(3),
      chat(4),
      chat(5),
      chat(6, { orderNum: 1 }),
    ];
    const { pinned, recent, total } = navSessions(chats, null);
    expect(ids(pinned)).toEqual(["chat-6", "chat-2"]);
    expect(ids(recent)).toEqual(["chat-5", "chat-4", "chat-3"]);
    expect(total).toBe(6);
  });

  it("排除归档", () => {
    const chats = [chat(1, { archived: true }), chat(3)];
    const { recent, total } = navSessions(chats, null);
    expect(ids(recent)).toEqual(["chat-3"]);
    expect(total).toBe(1);
  });

  it("当前会话不在露出范围时补到最近的最前", () => {
    const chats = [chat(1), chat(2), chat(3), chat(4), chat(9, { updateTime: 0 })];
    expect(ids(navSessions(chats, "chat-1").recent)).toEqual([
      "chat-1",
      "chat-4",
      "chat-3",
      "chat-2",
    ]);
    expect(ids(navSessions(chats, "chat-9").recent)).toEqual([
      "chat-9",
      "chat-4",
      "chat-3",
      "chat-2",
    ]);
    expect(ids(navSessions(chats, "chat-3").recent)).toEqual(["chat-4", "chat-3", "chat-2"]);
  });
});
