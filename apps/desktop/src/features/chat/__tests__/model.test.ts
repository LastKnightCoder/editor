import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/types";
import { navSessions, parseChatId } from "../model";

const chat = (id: number, patch: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id,
    createTime: 0,
    updateTime: id,
    messages: [],
    title: `对话 ${id}`,
    titleDirty: false,
    groupId: null,
    archived: false,
    parentChatId: null,
    branchIndex: 0,
    orderNum: null,
    ...patch,
  }) as ChatMessage;

describe("parseChatId", () => {
  it("只接受正整数字符串", () => {
    expect(parseChatId("12")).toBe(12);
    expect(parseChatId(undefined)).toBeNull();
    expect(parseChatId("0")).toBeNull();
    expect(parseChatId("abc")).toBeNull();
    expect(parseChatId("1.5")).toBeNull();
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
    expect(pinned.map(c => c.id)).toEqual([6, 2]);
    expect(recent.map(c => c.id)).toEqual([5, 4, 3]);
    expect(total).toBe(6);
  });

  it("排除归档与分支", () => {
    const chats = [chat(1, { archived: true }), chat(2, { parentChatId: 3 }), chat(3)];
    const { recent, total } = navSessions(chats, null);
    expect(recent.map(c => c.id)).toEqual([3]);
    expect(total).toBe(1);
  });

  it("当前会话不在露出范围时补到最近的最前", () => {
    const chats = [chat(1), chat(2), chat(3), chat(4), chat(9, { parentChatId: 4, updateTime: 0 })];
    expect(navSessions(chats, 1).recent.map(c => c.id)).toEqual([1, 4, 3, 2]);
    expect(navSessions(chats, 9).recent.map(c => c.id)).toEqual([9, 4, 3, 2]);
    expect(navSessions(chats, 3).recent.map(c => c.id)).toEqual([4, 3, 2]);
  });
});
