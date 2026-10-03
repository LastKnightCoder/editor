import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron-log", () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../pi-session-host-core", () => ({ loadSessionTranscript: vi.fn(() => []) }));
vi.mock("../pi-session-paths", () => ({
  chatSessionDirOfDb: () => "/sessions/data",
  resolveSessionFile: (dir: string, file: string) => `${dir}/${file}`,
}));

import {
  listChatPromptDocs,
  parseChatPromptKey,
  promptsOfTranscript,
  resetChatPromptCache,
} from "../chat-prompt-index";
import type { PiTranscriptEntry } from "../pi-session-transcript";
import { askedCandidates } from "../topic-insights-candidates";

const user = (id: string, text: string, timestamp = 1000): PiTranscriptEntry => ({
  id,
  message: { role: "user", content: [{ type: "text", text }], timestamp },
});
const assistant = (id: string, text: string): PiTranscriptEntry => ({
  id,
  message: { role: "assistant", content: [{ type: "text", text }] },
});

describe("chat-prompt 来源", () => {
  let main: Database.Database;
  beforeEach(() => {
    resetChatPromptCache();
    main = new Database(":memory:");
    main.exec(mainSchema);
  });
  afterEach(() => main.close());

  const addSession = (id: string, scope: string, updateTime: number) =>
    main
      .prepare(
        `INSERT INTO chat_session (id, scope, session_file, create_time, update_time) VALUES (?, ?, ?, 1, ?)`
      )
      .run(id, scope, `t_${id}.jsonl`, updateTime);

  it("只取用户消息、跳过太短的，时间取消息时间", () => {
    const docs = promptsOfTranscript(
      "s1",
      [
        user("a", "requestAnimationFrame 的回调在微任务之前还是之后？", 5000),
        assistant("b", "在之后……"),
        user("c", "好的"),
        { id: "d", message: { role: "user", content: "字符串内容的提问也算" } },
      ],
      42
    );
    expect(docs.map(doc => [doc.id, doc.updateTime])).toEqual([
      ["s1#a", 5000],
      ["s1#d", 42],
    ]);
    expect(docs[0].sections).toHaveLength(1);
    expect(parseChatPromptKey("chat-prompt:s1#a")).toEqual({ sessionId: "s1", messageId: "a" });
    expect(parseChatPromptKey("card:1")).toBeNull();
  });

  it("只读主对话；会话没变不重读文件，变了才重读", () => {
    addSession("s1", "main-chat", 10);
    addSession("s2", "pdf-chat", 10);
    const read = vi.fn((file: string) => [
      user(file.includes("s1") ? "m1" : "x", "事件循环每一轮都会渲染吗"),
    ]);
    expect(listChatPromptDocs(main, read).map(doc => doc.id)).toEqual(["s1#m1"]);
    expect(read).toHaveBeenCalledTimes(1);
    listChatPromptDocs(main, read);
    expect(read).toHaveBeenCalledTimes(1);
    main.prepare(`UPDATE chat_session SET update_time = 20 WHERE id = 's1'`).run();
    listChatPromptDocs(main, read);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("读会话出错只跳过那一个", () => {
    addSession("s1", "main-chat", 10);
    addSession("s2", "main-chat", 10);
    const read = vi.fn((file: string) => {
      if (file.includes("s1")) throw new Error("坏文件");
      return [user("m", "为什么 Promise 里改 DOM 不会马上重绘")];
    });
    expect(listChatPromptDocs(main, read).map(doc => doc.id)).toEqual(["s2#m"]);
  });
});

describe("问了但没写的候选", () => {
  const DIM = 8;
  let index: Database.Database;
  const unit = (axis: number, tilt = 0, tiltAxis = 7) => {
    const v = new Array(DIM).fill(0);
    v[axis] = 1;
    v[tiltAxis] += tilt;
    return v;
  };
  const add = (key: string, type: string, vector: number[], time: number, content = "") =>
    index
      .prepare(
        `INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding)
         VALUES (?, ?, ?, ?, 0, vec_f32(?))`
      )
      .run(key, time, content, type, JSON.stringify(vector));

  beforeEach(() => {
    index = new Database(":memory:");
    sqliteVec.load(index);
    index.exec(`CREATE VIRTUAL TABLE vec_documents USING vec0(
      prefixed_id TEXT, update_time FLOAT, content TEXT, type TEXT, chunk_index INTEGER,
      vec_embedding FLOAT[${DIM}] distance_metric=cosine)`);
    add("card:1", "card", unit(0), 1);
    add("article:2", "article", unit(1), 1);
  });
  afterEach(() => index.close());

  it("离笔记近的不算；相近的提问成组，次数多的在前", async () => {
    // 写过的：和 card:1 几乎同向
    add("chat-prompt:s1#a", "chat-prompt", unit(0, 0.05), 100, "写过的问题");
    // 没写过：轴 3 上三次、轴 5 上一次
    add("chat-prompt:s1#b", "chat-prompt", unit(3), 300, "渲染时机 1");
    add("chat-prompt:s2#c", "chat-prompt", unit(3, 0.1), 200, "渲染时机 2");
    add("chat-prompt:s3#d", "chat-prompt", unit(3, 0.15), 150, "渲染时机 3");
    add("chat-prompt:s4#e", "chat-prompt", unit(5), 400, "模块加载");
    const groups = await askedCandidates(index, 0.5);
    expect(groups.map(group => group.times)).toEqual([3, 1]);
    expect(groups[0].prompts.map(prompt => prompt.text)).toEqual([
      "渲染时机 1",
      "渲染时机 2",
      "渲染时机 3",
    ]);
    expect(groups[0].prompts[0]).toMatchObject({ sessionId: "s1", messageId: "b" });
    expect(groups[0].last).toBe(300);
    expect(groups.flatMap(group => group.prompts).some(p => p.text === "写过的问题")).toBe(false);
  });

  it("只看最近的若干条", async () => {
    add("chat-prompt:s1#old", "chat-prompt", unit(4), 1, "很久以前");
    add("chat-prompt:s1#new", "chat-prompt", unit(5), 9, "最近");
    const groups = await askedCandidates(index, 0.5, { recent: 1 });
    expect(groups.flatMap(group => group.prompts).map(p => p.text)).toEqual(["最近"]);
  });
});
