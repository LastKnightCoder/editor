import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SessionManager,
  buildSessionContext as officialContext,
  type SessionEntry as OfficialEntry,
} from "@earendil-works/pi-coding-agent";
import { AiError } from "../../contracts";
import {
  appendSessionEntries,
  applySessionEdit,
  buildSessionContext,
  convertSessionMessagesToLlm,
  createSessionFile,
  getSessionBranch,
  getSessionTranscript,
  parseSessionFile,
  projectSessionMessages,
  serializeSessionFile,
  type SessionDocument,
  type SessionEntryInput,
} from "../index";

const stamp = "2026-10-29T00:00:00.000Z";
const message = (role: string, content: unknown) => ({ role, content, timestamp: 1 });
const assistant = (text: string) => ({
  ...message("assistant", [{ type: "text", text }]),
  provider: "test-provider",
  model: "test-model",
  api: "openai-completions",
  stopReason: "stop",
  usage: { input: 10, output: 4, cacheRead: 2, cacheWrite: 1 },
});
const fresh = () => createSessionFile({ id: "session-test", timestamp: stamp });
const add = (document: SessionDocument, entries: SessionEntryInput[]) =>
  appendSessionEntries(document, entries, { now: stamp });
const toOfficial = (document: SessionDocument) => document.entries as unknown as OfficialEntry[];
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("会话 v3 编解码", () => {
  it("保留未知字段和提供方签名，往返不改写原始消息", () => {
    const document = add(fresh(), [
      {
        type: "message",
        id: "u",
        message: message("user", [{ type: "text", text: "你好" }]),
        extension: { future: 3 },
      },
      {
        type: "message",
        id: "a",
        message: { ...assistant("回复"), opaqueSignature: "opaque-test-signature" },
      },
    ]);
    document.header.extension = { enabled: true };
    expect(parseSessionFile(serializeSessionFile(document))).toEqual(document);
    expect(projectSessionMessages(document).map(item => item.role)).toEqual(["user", "assistant"]);
  });

  it("保留无换行的有效末行，诊断截断尾行且禁止静默序列化或续写", () => {
    const document = add(fresh(), [{ type: "message", id: "u", message: message("user", "中文") }]);
    const text = serializeSessionFile(document);
    expect(parseSessionFile(text.trimEnd())).toEqual(document);
    const incomplete = parseSessionFile(text + '{"type":"message"');
    expect(incomplete.entries).toEqual(document.entries);
    expect(incomplete.diagnostics[0]).toMatchObject({
      code: "incomplete-tail",
      byteOffset: new TextEncoder().encode(text).length,
    });
    expect(() => serializeSessionFile(incomplete)).toThrow(AiError);
    expect(() => appendSessionEntries(incomplete, [])).toThrow(AiError);
    expect(() => buildSessionContext(incomplete)).toThrow(AiError);
  });

  it("拒绝中间坏行、重复身份、悬空父节点和未来格式", () => {
    const header = serializeSessionFile(fresh());
    const entry = JSON.stringify({
      type: "custom",
      id: "one",
      parentId: null,
      timestamp: stamp,
      customType: "test",
    });
    for (const text of [
      header + "broken\n" + entry + "\n",
      header + entry + "\n" + entry + "\n",
      header + entry.replace('"parentId":null', '"parentId":"missing"') + "\n",
    ])
      expect(() => parseSessionFile(text)).toThrow(AiError);
    expect(() =>
      parseSessionFile(
        JSON.stringify({ type: "session", version: 4, id: "future", cwd: "", timestamp: stamp })
      )
    ).toThrow(expect.objectContaining({ code: "AI_SESSION_FORMAT_UNSUPPORTED" }));
  });

  it("未知记录保留并允许历史展示，但不把它误当成安全模型上下文", () => {
    const document = add(fresh(), [
      { type: "message", id: "u", message: message("user", "原始问题") },
      { type: "future_action", id: "future", payload: { untouched: true } },
    ]);
    expect(parseSessionFile(serializeSessionFile(document))).toEqual(document);
    expect(projectSessionMessages(document)).toHaveLength(1);
    expect(() => buildSessionContext(document)).toThrow(
      expect.objectContaining({ code: "AI_SESSION_FORMAT_UNSUPPORTED" })
    );
  });
});

describe("上下文与官方 pi v3 差分", () => {
  it("模型、思考档位、custom_message、替换与省略一致", () => {
    const document = add(fresh(), [
      { type: "model_change", id: "model", provider: "first", modelId: "initial" },
      { type: "thinking_level_change", id: "thinking", thinkingLevel: "high" },
      { type: "message", id: "u", message: message("user", "原始问题") },
      { type: "message", id: "a", message: assistant("原始回答") },
      { type: "context_edit", id: "edit", targetId: "a", replacement: { content: "改写回答" } },
      {
        type: "custom_message",
        id: "custom",
        customType: "context",
        content: "补充背景",
        display: false,
        details: { keep: true },
      },
      { type: "message", id: "u2", message: message("user", "省略的问题") },
      { type: "context_edit", id: "omit", targetId: "u2", replacement: null },
    ]);
    expect(buildSessionContext(document)).toEqual(officialContext(toOfficial(document)));
    expect(JSON.stringify(projectSessionMessages(document))).not.toContain("省略的问题");
    expect(JSON.stringify(projectSessionMessages(document))).toContain("改写回答");
  });

  it("多次压缩按最新边界恢复模型，历史仍保留完整消息", () => {
    const document = add(fresh(), [
      { type: "message", id: "system", message: message("system", "旧提示") },
      { type: "message", id: "u1", message: message("user", "第一问") },
      { type: "message", id: "a1", message: assistant("第一答") },
      {
        type: "compaction",
        id: "c1",
        summary: "第一次摘要",
        firstKeptEntryId: "u1",
        tokensBefore: 100,
      },
      { type: "message", id: "u2", message: message("user", "第二问") },
      { type: "message", id: "a2", message: assistant("第二答") },
      {
        type: "compaction",
        id: "c2",
        summary: "第二次摘要",
        firstKeptEntryId: "a1",
        tokensBefore: 200,
        systemMessage: message("system", "当前提示"),
      },
      { type: "branch_summary", id: "branch", fromId: "u1", summary: "旁支摘要" },
    ]);
    expect(buildSessionContext(document)).toEqual(officialContext(toOfficial(document)));
    expect(projectSessionMessages(document)).toHaveLength(4);
    const context = buildSessionContext(document);
    const normalized = convertSessionMessagesToLlm(context.messages);
    expect(normalized.some(item => JSON.stringify(item).includes("第二次摘要"))).toBe(true);
    expect(normalized.some(item => JSON.stringify(item).includes("第一次摘要"))).toBe(false);
  });

  it("官方落盘后公共读取，公共追加后官方恢复，同一文件可来回续写", () => {
    const directory = mkdtempSync(join(tmpdir(), "tau-ai-session-"));
    dirs.push(directory);
    const manager = SessionManager.create(directory, directory, { id: "roundtrip-session" });
    manager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "桌面问题" }],
      timestamp: 1,
    });
    manager.appendMessage(assistant("桌面回答") as never);
    const path = manager.getSessionFile()!;
    const document = parseSessionFile(readFileSync(path, "utf8"));
    expect(buildSessionContext(document)).toEqual(manager.buildSessionContext());
    const updated = add(document, [
      { type: "message", id: "mobile-user", message: message("user", "手机问题") },
    ]);
    writeFileSync(path, serializeSessionFile(updated));
    const resumed = SessionManager.open(path, directory);
    expect(resumed.buildSessionContext()).toEqual(buildSessionContext(updated));
    resumed.appendMessage(assistant("再次桌面回答") as never);
    expect(projectSessionMessages(parseSessionFile(readFileSync(path, "utf8")))).toHaveLength(4);
  });
});

describe("分支与展示投影", () => {
  it("工具展示结果与模型结果分别保留，重开后不将模型专用内容显示给用户", () => {
    const document = add(fresh(), [
      { type: "message", id: "u", message: message("user", "读取") },
      {
        type: "message",
        id: "a",
        message: {
          ...assistant(""),
          content: [{ type: "toolCall", id: "call", name: "read", arguments: {} }],
        },
      },
      {
        type: "message",
        id: "r",
        message: {
          role: "toolResult",
          toolCallId: "call",
          toolName: "read",
          content: [{ type: "text", text: "模型专用结构化摘要" }],
          details: { displayContent: "供用户查看的结果", render: { version: 1 } },
          timestamp: 2,
        },
      },
    ]);
    const response = projectSessionMessages(document)[1];
    expect(JSON.stringify(response)).toContain("供用户查看的结果");
    expect(JSON.stringify(response)).not.toContain("模型专用结构化摘要");
    expect(JSON.stringify(buildSessionContext(document))).toContain("模型专用结构化摘要");
    expect(parseSessionFile(serializeSessionFile(document))).toEqual(document);
  });

  it("以文本顺序认领 display，删除/切版本不破坏分支", () => {
    let document = add(fresh(), [
      { type: "message", id: "u1", message: message("user", "模型文本") },
      {
        type: "custom",
        id: "display",
        customType: "desktop-display",
        data: {
          modelText: "模型文本",
          content: [{ type: "text", text: "原始输入" }],
          clientId: "client-user",
        },
      },
      { type: "message", id: "a1", message: assistant("第一答") },
      { type: "message", id: "u2", message: message("user", "第二问") },
      { type: "message", id: "a2", message: assistant("第二答") },
    ]);
    expect(getSessionTranscript(document)[0].display?.clientId).toBe("client-user");
    document = applySessionEdit(document, { kind: "rewind", entryId: "u2" });
    document = add(document, [
      { type: "message", id: "u3", message: message("user", "第二问改写") },
    ]);
    expect(getSessionTranscript(document).at(-1)?.versions).toEqual({
      ids: ["u2", "u3"],
      index: 1,
    });
    document = applySessionEdit(document, { kind: "switch", entryId: "u2" });
    expect(getSessionBranch(document).some(entry => entry.id === "a2")).toBe(true);
    expect(getSessionBranch(document).some(entry => entry.id === "u3")).toBe(false);
    document = applySessionEdit(document, { kind: "omit", entryIds: ["a1"] });
    expect(JSON.stringify(projectSessionMessages(document))).not.toContain("第一答");
    expect(buildSessionContext(document)).toEqual(officialContext(toOfficial(document)));
  });

  it("工具循环合成同一回答，保留结构化载荷、用量与错误", () => {
    const document = add(fresh(), [
      { type: "message", id: "u", message: message("user", "操作") },
      {
        type: "message",
        id: "a",
        message: {
          ...assistant("执行前"),
          content: [
            { type: "thinking", thinking: "推理", signature: "sig" },
            { type: "text", text: "执行前" },
            { type: "toolCall", id: "call-1", name: "local_read", arguments: { id: 1 } },
          ],
        },
      },
      {
        type: "message",
        id: "result",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "local_read",
          content: [{ type: "text", text: "读取失败" }],
          isError: true,
          details: { render: { version: 1, data: { known: false } } },
          timestamp: 3,
        },
      },
      { type: "message", id: "a2", message: assistant("执行后") },
    ]);
    const messages = projectSessionMessages(document);
    expect(messages).toHaveLength(2);
    const response = messages[1];
    expect(response).toMatchObject({
      content: "执行前\n\n执行后",
      usage: { inputTokens: 13, cacheReadTokens: 2, cacheWriteTokens: 1 },
      piEntryIds: ["a", "result", "a2"],
    });
    expect(response).toHaveProperty(
      "assistant_blocks",
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool_call",
          execution: expect.objectContaining({
            status: "failed",
            metadata: { render: { version: 1, data: { known: false } } },
          }),
        }),
      ])
    );
  });
});
