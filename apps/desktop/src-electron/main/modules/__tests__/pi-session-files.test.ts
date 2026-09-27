/**
 * 会话文件的改历史操作（M4）：迁移写出的文件能被 pi resume 续聊；编辑重发/重新生成挪叶子后
 * 重开仍落在新位置；删除单条消息对模型和界面都隐藏；建分支拷出新文件且 id 为指定值。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fauxProvider, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  assembleHostSession,
  createFauxModelRuntime,
  loadSessionTranscript,
} from "../pi-session-host-core";
import {
  branchSessionFile,
  omitEntries,
  rewindToBeforeUser,
  writeSessionFile,
} from "../pi-session-files";
import { piEntriesToDesktopMessages } from "../pi-session-transcript";

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

const assistant = (text: string, at: number) => ({
  role: "assistant" as const,
  content: [{ type: "text" as const, text }],
  api: "openai-completions" as const,
  provider: "legacy",
  model: "legacy",
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: "stop" as const,
  timestamp: at,
});
const user = (text: string, at: number) => ({
  role: "user" as const,
  content: text,
  timestamp: at,
});

/** 两问两答的迁移文件 */
const writeTwoTurns = (sessionDir: string, sessionId = "migrated-1") =>
  writeSessionFile({
    sessionDir,
    sessionId,
    cwd: sessionDir,
    createdAt: 1,
    messages: [
      {
        message: user("第一问", 1),
        display: { modelText: "第一问", content: [{ type: "text", text: "第一问" }] },
      },
      { message: assistant("第一答", 2) },
      {
        message: user("第二问", 3),
        display: { modelText: "第二问", content: [{ type: "text", text: "第二问" }] },
      },
      { message: assistant("第二答", 4) },
    ],
  });

const userTexts = (sessionFile: string, sessionDir: string) =>
  piEntriesToDesktopMessages(loadSessionTranscript(sessionFile, sessionDir))
    .filter(message => message.role === "user")
    .map(message =>
      typeof message.content === "string"
        ? message.content
        : (message.content as Array<{ text?: string }>).map(block => block.text ?? "").join("")
    );

const setup = () => {
  const workDir = mkdtempSync(join(tmpdir(), "pi-files-"));
  workDirs.push(workDir);
  return join(workDir, "sessions");
};

describe("会话文件操作", () => {
  it("迁移写出的文件能被 pi resume：模型看得到迁移过来的历史并接着答", async () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    const faux = fauxProvider({});
    const modelRuntime = await createFauxModelRuntime(join(sessionDir, "..", "auth.json"), faux);
    let seen: string[] = [];
    faux.setResponses([
      context => {
        seen = context.messages
          .filter(message => message.role === "user")
          .map(message =>
            typeof message.content === "string"
              ? message.content
              : message.content
                  .filter(block => block.type === "text")
                  .map(block => (block as { text: string }).text)
                  .join("")
          );
        return fauxAssistantMessage([fauxText("第三答")]);
      },
    ]);
    const session = await assembleHostSession({
      cwd: sessionDir,
      agentDir: join(sessionDir, "..", ".pi-agent"),
      modelRuntime,
      modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
      sessionDir,
      sessionFile: file,
    });
    sessions.push(session);
    expect(session.sessionId).toBe("migrated-1");
    await session.prompt("第三问");
    expect(seen).toEqual(["第一问", "第二问", "第三问"]);
  });

  it("编辑重发：挪到第二问之前，重开后叶子仍在那里，旧回答留在树上", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    rewindToBeforeUser(file, 1);

    expect(userTexts(file, sessionDir)).toEqual(["第一问"]);
    // 旧分支没丢：整棵树里还有第二问
    const all = SessionManager.open(file).getEntries();
    expect(
      all.some(
        entry =>
          entry.type === "message" &&
          (entry as { message: { content: unknown } }).message.content === "第二问"
      )
    ).toBe(true);
  });

  it("挪到第一条用户消息之前（重新生成第一问）：界面为空", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    rewindToBeforeUser(file, 0);
    expect(userTexts(file, sessionDir)).toEqual([]);
  });

  it("删除单条消息：context_edit 省略，界面与模型上下文都看不到它", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    const target = SessionManager.open(file)
      .getBranch()
      .find(
        entry =>
          entry.type === "message" &&
          (entry as { message: { content: unknown } }).message.content === "第一问"
      );
    omitEntries(file, [target!.id]);

    expect(userTexts(file, sessionDir)).toEqual(["第二问"]);
    const context = SessionManager.open(file).buildSessionContext();
    expect(
      context.messages.some(message => (message as { content?: unknown }).content === "第一问")
    ).toBe(false);
  });

  it("建分支：截到第一问的回答为止，新文件 id 为指定值，原文件不变", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    const branchName = branchSessionFile({
      sessionDir,
      sourceFile: file,
      newSessionId: "branch-1",
      throughUserIndex: 0,
    });
    const branchFile = join(sessionDir, branchName);

    expect(SessionManager.open(branchFile).getSessionId()).toBe("branch-1");
    expect(userTexts(branchFile, sessionDir)).toEqual(["第一问"]);
    expect(userTexts(file, sessionDir)).toEqual(["第一问", "第二问"]);
  });
});
