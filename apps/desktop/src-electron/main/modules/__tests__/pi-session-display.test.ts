/**
 * 展示 entry 的落盘与投影（M4）：JSONL 里的用户消息是**发给模型的那一版**（文件附件是
 * 「请用 read 工具读取」提示），界面要显示的是文件卡片等原始形态。prompt 时登记展示形态，
 * 主进程在用户消息落盘后紧跟着写一条 custom entry；重开对话时投影按模型文本认领它。
 *
 * 用真实 pi 会话（faux provider）跑完整条链：prompt → 落盘 → 重开投影。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fauxProvider, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import {
  assembleHostSession,
  createDisplayEntryWriter,
  createFauxModelRuntime,
  loadSessionTranscript,
  userModelTextOf,
} from "../pi-session-host-core";
import { piEntriesToDesktopMessages } from "../pi-session-transcript";
import type { MessageContent } from "@/types";

// jsdom 环境的 AbortSignal 缺 any()（见 pi-session-host-core.test.ts）
if (typeof AbortSignal.any !== "function") {
  Object.assign(AbortSignal, {
    any(signals: AbortSignal[]): AbortSignal {
      const controller = new AbortController();
      for (const signal of signals) {
        if (signal.aborted) {
          controller.abort(signal.reason);
          break;
        }
        signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
      }
      return controller.signal;
    },
  });
}

const workDirs: string[] = [];
const sessions: AgentSession[] = [];
afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.abort();
    session.dispose();
  }
  for (const dir of workDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const setup = async () => {
  const workDir = mkdtempSync(join(tmpdir(), "pi-display-"));
  workDirs.push(workDir);
  const sessionDir = join(workDir, "sessions");
  const faux = fauxProvider({});
  const modelRuntime = await createFauxModelRuntime(join(workDir, "auth.json"), faux);
  const session = await assembleHostSession({
    cwd: workDir,
    agentDir: join(workDir, ".pi-agent"),
    modelRuntime,
    modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
    sessionDir,
    sessionId: "chat-1",
  });
  sessions.push(session);
  return { faux, session, sessionDir, writer: createDisplayEntryWriter(session) };
};

/** 重开对话（纯读投影，不起会话） */
const reopen = (sessionFile: string, sessionDir: string) =>
  piEntriesToDesktopMessages(loadSessionTranscript(sessionFile, sessionDir));

/** 文件附件的展示形态（界面上是文件卡片）与发给模型的文本（让它自己 read） */
const fileDisplay: MessageContent[] = [
  { type: "text", text: "看看这个" },
  { type: "file", file: "/tmp/demo.pdf", fileName: "demo.pdf" },
];
const fileModelText =
  "看看这个\n[文件：demo.pdf]\n路径：/tmp/demo.pdf\n请使用 pi 的 read 工具读取该文件。";
/** 展示 entry 由 pi 事件驱动写入，推迟一个微任务落盘，这里让出一轮事件循环 */
const settleWrites = () => new Promise(resolve => setTimeout(resolve, 0));
const userTexts = (messages: ReturnType<typeof reopen>) =>
  messages
    .filter(message => message.role === "user")
    .map(message =>
      typeof message.content === "string"
        ? message.content
        : (message.content as Array<{ text?: string }>).map(block => block.text ?? "").join("|")
    );

describe("展示 entry", () => {
  it("重开对话时用户消息是文件卡片，模型上下文里仍是 read 提示", async () => {
    const { faux, session, sessionDir, writer } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("我看看")])]);

    writer.expect({ modelText: fileModelText, content: fileDisplay, clientId: "local-1" });
    await session.prompt(fileModelText, { expandPromptTemplates: false });
    await settleWrites();

    const file = session.sessionFile as string;
    const [user] = reopen(file, sessionDir);
    // 界面：原始的文件卡片，clientId 沿用发送时的（列表不重挂载）
    expect(user).toMatchObject({ clientId: "local-1", role: "user", content: fileDisplay });
    // 模型：仍是 read 提示（展示 entry 是 custom，不进上下文）
    const contextTexts = session.sessionManager
      .buildSessionContext()
      .messages.filter(message => (message as { role?: string }).role === "user")
      .map(message => userModelTextOf((message as { content?: unknown }).content));
    expect(contextTexts).toEqual([fileModelText]);
  });

  it("按模型文本认领：先后登记的两条消息各自对上自己的展示形态", async () => {
    const { faux, session, sessionDir, writer } = await setup();
    faux.setResponses([
      fauxAssistantMessage([fauxText("第一答")]),
      fauxAssistantMessage([fauxText("第二答")]),
    ]);

    writer.expect({ modelText: "第一问", content: [{ type: "text", text: "第一问（原话）" }] });
    await session.prompt("第一问", { expandPromptTemplates: false });
    writer.expect({ modelText: "第二问", content: [{ type: "text", text: "第二问（原话）" }] });
    await session.prompt("第二问", { expandPromptTemplates: false });
    await settleWrites();

    expect(userTexts(reopen(session.sessionFile as string, sessionDir))).toEqual([
      "第一问（原话）",
      "第二问（原话）",
    ]);
  });

  it("没有展示形态（一次性入口）时退回用模型文本展示", async () => {
    const { faux, session, sessionDir } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("好")])]);
    await session.prompt("纯文本问题", { expandPromptTemplates: false });
    await settleWrites();
    expect(userTexts(reopen(session.sessionFile as string, sessionDir))).toEqual(["纯文本问题"]);
  });

  it("prompt 失败撤回登记：不会把展示形态错认到下一条消息上", async () => {
    const { faux, session, sessionDir, writer } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("好")])]);

    const abandoned = {
      modelText: "没发出去的",
      content: [{ type: "text" as const, text: "废稿" }],
    };
    writer.expect(abandoned);
    writer.discard(abandoned);
    await session.prompt("没发出去的", { expandPromptTemplates: false });
    await settleWrites();

    // 文本相同也不该认领：登记已撤回
    expect(userTexts(reopen(session.sessionFile as string, sessionDir))).toEqual(["没发出去的"]);
  });
});
