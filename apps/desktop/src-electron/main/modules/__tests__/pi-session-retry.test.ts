import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { SessionManager, type AgentSession } from "@earendil-works/pi-coding-agent";
import { assembleHostSession, createFauxModelRuntime, transcriptOf } from "../pi-session-host-core";
import {
  conversationTreeOf,
  messageVersionsOf,
  rewindToBeforeEntry,
  writeSessionFile,
} from "../pi-session-files";
import { piEntriesToDesktopMessages } from "../pi-session-transcript";
import { retryHostSession } from "../pi-session-retry";

const sessions: AgentSession[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.abort();
    session.dispose();
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "pi-retry-"));
  dirs.push(dir);
  const file = join(
    dir,
    writeSessionFile({
      sessionDir: dir,
      sessionId: "retry-test",
      cwd: dir,
      createdAt: 1,
      messages: [
        {
          message: { role: "user", content: "原问题与附件上下文", timestamp: 1 },
          display: {
            modelText: "原问题与附件上下文",
            clientId: "original-question",
            content: [
              { type: "text", text: "原问题" },
              { type: "file", file: "/tmp/a.pdf", fileName: "a.pdf" },
            ],
          },
        },
        {
          message: fauxAssistantMessage([], { stopReason: "error" }),
        },
      ],
    })
  );
  const faux = fauxProvider({});
  const modelRuntime = await createFauxModelRuntime(join(dir, "auth.json"), faux);
  const session = await assembleHostSession({
    cwd: dir,
    agentDir: join(dir, ".pi-agent"),
    sessionDir: dir,
    sessionFile: file,
    modelRuntime,
    modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
  });
  session.setAutoRetryEnabled(false);
  sessions.push(session);
  const entryId = transcriptOf(session.sessionManager).find(
    entry => entry.message.role === "user"
  )?.id;
  if (!entryId) throw new Error("测试会话缺少原问题");
  return { session, faux, file, entryId };
}

describe("失败重试不产生分支", () => {
  it("重复失败后成功：只有原问题、附件保留、重开没有版本，运行正常沉淀", async () => {
    const { session, faux, file, entryId } = await setup();
    const events: string[] = [];
    session.subscribe(event => events.push(event.type));
    faux.setResponses([
      () => fauxAssistantMessage([], { stopReason: "error" }),
      context => {
        expect(
          context.messages.some(
            message => message.role === "system" && message.content === "本轮系统提示"
          )
        ).toBe(true);
        expect(
          context.messages.filter(
            message =>
              message.role === "user" &&
              JSON.stringify(message.content).includes("原问题与附件上下文")
          )
        ).toHaveLength(1);
        return fauxAssistantMessage([fauxText("重试成功")]);
      },
    ]);
    const transform = session.agent.transformContext;
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(
        await retryHostSession(session, { entryId }, "本轮系统提示", new AbortController().signal)
      ).toBe(true);
      expect(session.agent.transformContext).toBe(transform);
    }
    expect(events.filter(type => type === "agent_settled")).toHaveLength(2);
    const manager = SessionManager.open(file);
    expect(conversationTreeOf(manager)).toHaveLength(1);
    expect(messageVersionsOf(manager.getEntries()).size).toBe(0);
    const messages = piEntriesToDesktopMessages(transcriptOf(manager));
    expect(messages.map(message => message.role)).toEqual(["user", "assistant"]);
    expect(messages[0].piEntryIds).toEqual([entryId]);
    expect(messages[0].content).toContainEqual({
      type: "file",
      file: "/tmp/a.pdf",
      fileName: "a.pdf",
    });
    expect(messages[1].content).toBe("重试成功");
  });

  it("已有结果拒绝原位重试，重新生成仍保留两个可切换版本", async () => {
    const { session, faux, entryId } = await setup();
    faux.setResponses([
      () => fauxAssistantMessage([fauxText("原回答")]),
      () => fauxAssistantMessage([fauxText("新回答")]),
    ]);
    await retryHostSession(session, { entryId }, "", new AbortController().signal);
    const count = session.sessionManager.getEntries().length;
    await expect(
      retryHostSession(session, { entryId }, "", new AbortController().signal)
    ).rejects.toThrow("已有回答");
    expect(session.sessionManager.getEntries()).toHaveLength(count);
    rewindToBeforeEntry(session.sessionManager, entryId);
    session.refreshContext();
    await session.prompt("原问题与附件上下文");
    expect(conversationTreeOf(session.sessionManager)).toHaveLength(2);
    expect(messageVersionsOf(session.sessionManager.getEntries()).get(entryId)?.ids).toHaveLength(
      2
    );
  });

  it("未落盘使用 clientId 认领；提交前失败返回正常提交，失效 entry 不改历史", async () => {
    const { session, faux } = await setup();
    faux.setResponses([() => fauxAssistantMessage([fauxText("恢复成功")])]);
    expect(
      await retryHostSession(session, { clientId: "new-unsent" }, "", new AbortController().signal)
    ).toBe(false);
    await expect(
      retryHostSession(session, { entryId: "stale" }, "", new AbortController().signal)
    ).rejects.toThrow();
    expect(
      await retryHostSession(
        session,
        { clientId: "original-question" },
        "",
        new AbortController().signal
      )
    ).toBe(true);
    expect(conversationTreeOf(session.sessionManager)).toHaveLength(1);
  });

  it("工具执行记录与后续追问不能被当成空失败清除", async () => {
    const { session, entryId } = await setup();
    session.sessionManager.appendMessage(
      fauxAssistantMessage([fauxToolCall("write", {})], { stopReason: "toolUse" })
    );
    const count = session.sessionManager.getEntries().length;
    await expect(
      retryHostSession(session, { entryId }, "", new AbortController().signal)
    ).rejects.toThrow("已有回答");
    expect(session.sessionManager.getEntries()).toHaveLength(count);
    session.sessionManager.appendMessage({ role: "user", content: "追问", timestamp: 2 });
    await expect(
      retryHostSession(session, { entryId }, "", new AbortController().signal)
    ).rejects.toThrow("后续对话");
  });

  it("已取消的重试不会修改原记录", async () => {
    const { session, entryId } = await setup();
    const count = session.sessionManager.getEntries().length;
    const controller = new AbortController();
    controller.abort();
    await expect(retryHostSession(session, { entryId }, "", controller.signal)).rejects.toThrow();
    expect(session.sessionManager.getEntries()).toHaveLength(count);
  });
});
