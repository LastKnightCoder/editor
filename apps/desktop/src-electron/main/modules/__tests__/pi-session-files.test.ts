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
  forkAfterEntry,
  omitEntries,
  rewindToBeforeEntry,
  switchToVersion,
  writeSessionFile,
} from "../pi-session-files";
import { applySessionEdit, applySessionEditToFile } from "../pi-session-store";
import type { RequestMessage } from "@/types";

/** 投影里第 n 条用户消息 / 回答带回的 entry id（界面按它们调改历史操作） */
const projected = (sessionFile: string, sessionDir: string) =>
  piEntriesToDesktopMessages(loadSessionTranscript(sessionFile, sessionDir));
const userEntryId = (sessionFile: string, sessionDir: string, index: number) =>
  projected(sessionFile, sessionDir).filter(message => message.role === "user")[index]
    .piEntryIds![0];
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
    rewindToBeforeEntry(SessionManager.open(file), userEntryId(file, sessionDir, 1));

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
    rewindToBeforeEntry(SessionManager.open(file), userEntryId(file, sessionDir, 0));
    expect(userTexts(file, sessionDir)).toEqual([]);
  });

  it("删除一条回答：按投影带回的全部 entry id 省略，回答整条消失", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    const firstAnswer = projected(file, sessionDir).find(message => message.role === "assistant")!;
    expect(firstAnswer.piEntryIds?.length).toBeGreaterThan(0);
    omitEntries(SessionManager.open(file), firstAnswer.piEntryIds!);
    expect(projected(file, sessionDir).map(message => message.role)).toEqual([
      "user",
      "user",
      "assistant",
    ]);
  });

  it("被删的消息仍在路径上时，按 entry id 回退不会错位", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    omitEntries(SessionManager.open(file), [userEntryId(file, sessionDir, 0)]);
    // 删掉第一问后界面上只剩第二问；对它重新生成要回退到第二问之前，而不是第一问之前
    rewindToBeforeEntry(SessionManager.open(file), userEntryId(file, sessionDir, 0));
    const answers = projected(file, sessionDir).filter(message => message.role === "assistant");
    expect(answers).toHaveLength(1);
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
    omitEntries(SessionManager.open(file), [target!.id]);

    expect(userTexts(file, sessionDir)).toEqual(["第二问"]);
    const context = SessionManager.open(file).buildSessionContext();
    expect(
      context.messages.some(message => (message as { content?: unknown }).content === "第一问")
    ).toBe(false);
  });
});

/** 往文件的当前叶子上追加一问一答（模拟回退/分叉后又发了一轮） */
const appendTurn = (file: string, question: string, answer: string, at: number) => {
  const manager = SessionManager.open(file);
  manager.appendMessage(user(question, at));
  manager.appendCustomEntry("desktop-display", {
    modelText: question,
    content: [{ type: "text", text: question }],
  });
  manager.appendMessage(assistant(answer, at + 1));
};

const userAt = (file: string, sessionDir: string, index: number) =>
  projected(file, sessionDir).filter(message => message.role === "user")[index] as RequestMessage;

const answerTexts = (file: string, sessionDir: string) =>
  projected(file, sessionDir)
    .filter(message => message.role === "assistant")
    .map(message => (message as { content: string }).content);

describe("会话树（M4-d）", () => {
  it("编辑重发后同一位置有两个版本，投影带上 ‹ i/n ›；只有一个版本的消息不带", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    rewindToBeforeEntry(SessionManager.open(file), userEntryId(file, sessionDir, 1));
    appendTurn(file, "第二问（改）", "第二答（改）", 10);

    expect(userTexts(file, sessionDir)).toEqual(["第一问", "第二问（改）"]);
    expect(userAt(file, sessionDir, 0).piVersions).toBeUndefined();
    const versions = userAt(file, sessionDir, 1).piVersions!;
    expect(versions.ids).toHaveLength(2);
    // 按写入顺序：原版本在前，新版本是第二个，当前在新版本上
    expect(versions.index).toBe(1);
  });

  it("切回原版本：后面整段对话一起换回去，重开仍在原版本", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    rewindToBeforeEntry(SessionManager.open(file), userEntryId(file, sessionDir, 1));
    appendTurn(file, "第二问（改）", "第二答（改）", 10);
    const [original] = userAt(file, sessionDir, 1).piVersions!.ids;

    switchToVersion(SessionManager.open(file), original);

    expect(userTexts(file, sessionDir)).toEqual(["第一问", "第二问"]);
    expect(answerTexts(file, sessionDir)).toEqual(["第一答", "第二答"]);
    expect(userAt(file, sessionDir, 1).piVersions!.index).toBe(0);
  });

  it("切到一个版本落在它子树里最近写入的位置（那个版本后来又聊了几轮）", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    rewindToBeforeEntry(SessionManager.open(file), userEntryId(file, sessionDir, 1));
    appendTurn(file, "第二问（改）", "第二答（改）", 10);
    appendTurn(file, "第三问", "第三答", 20);
    const [original, edited] = userAt(file, sessionDir, 1).piVersions!.ids;

    switchToVersion(SessionManager.open(file), original);
    switchToVersion(SessionManager.open(file), edited);

    expect(userTexts(file, sessionDir)).toEqual(["第一问", "第二问（改）", "第三问"]);
  });

  it("重新生成第一问：根上的两个版本同样能切换", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    rewindToBeforeEntry(SessionManager.open(file), userEntryId(file, sessionDir, 0));
    appendTurn(file, "第一问", "第一答（重新生成）", 10);

    const versions = userAt(file, sessionDir, 0).piVersions!;
    expect(versions.ids).toHaveLength(2);
    switchToVersion(SessionManager.open(file), versions.ids[0]);
    expect(answerTexts(file, sessionDir)).toEqual(["第一答", "第二答"]);
  });

  it("从这里建分支：回到第一答之后，下一条消息成为第二问的另一个版本", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    const firstAnswer = projected(file, sessionDir).find(message => message.role === "assistant")!;
    forkAfterEntry(SessionManager.open(file), firstAnswer.piEntryIds!.at(-1)!);

    expect(userTexts(file, sessionDir)).toEqual(["第一问"]);
    appendTurn(file, "另一个方向", "另一个回答", 10);
    const versions = userAt(file, sessionDir, 1).piVersions!;
    expect(versions.ids).toHaveLength(2);
    expect(userTexts(file, sessionDir)).toEqual(["第一问", "另一个方向"]);
  });

  it("删过的消息在切版本后仍保持删除（省略只作用于它所在的路径，切换时重挂）", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    const firstAnswer = projected(file, sessionDir).find(message => message.role === "assistant")!;
    omitEntries(SessionManager.open(file), firstAnswer.piEntryIds!);
    rewindToBeforeEntry(SessionManager.open(file), userEntryId(file, sessionDir, 1));
    appendTurn(file, "第二问（改）", "第二答（改）", 10);
    const [original, edited] = userAt(file, sessionDir, 1).piVersions!.ids;

    switchToVersion(SessionManager.open(file), original);
    expect(answerTexts(file, sessionDir)).toEqual(["第二答"]);
    switchToVersion(SessionManager.open(file), edited);
    expect(answerTexts(file, sessionDir)).toEqual(["第二答（改）"]);
    // 模型上下文同样看不到被删的第一答
    const context = SessionManager.open(file).buildSessionContext();
    expect(
      context.messages.some(message =>
        JSON.stringify((message as { content?: unknown }).content).includes("第一答")
      )
    ).toBe(false);
  });

  it("文件入口：没有宿主开着时直接改文件；文件不存在时报错", () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    applySessionEditToFile(file, { kind: "rewind", entryId: userEntryId(file, sessionDir, 1) });
    expect(userTexts(file, sessionDir)).toEqual(["第一问"]);
    expect(() =>
      applySessionEditToFile(join(sessionDir, "missing.jsonl"), { kind: "omit", entryIds: ["x"] })
    ).toThrow();
  });

  it("活会话上改树 + refreshContext：不重建会话，模型下一轮看到的是切换后的路径", async () => {
    const sessionDir = setup();
    const file = join(sessionDir, writeTwoTurns(sessionDir));
    const faux = fauxProvider({});
    const modelRuntime = await createFauxModelRuntime(join(sessionDir, "..", "auth.json"), faux);
    let seen: string[] = [];
    const recordUsers = (context: { messages: Array<{ role: string; content: unknown }> }) => {
      seen = context.messages
        .filter(message => message.role === "user")
        .map(message =>
          typeof message.content === "string"
            ? message.content
            : (message.content as Array<{ type: string; text?: string }>)
                .filter(block => block.type === "text")
                .map(block => block.text ?? "")
                .join("")
        );
      return fauxAssistantMessage([fauxText("好")]);
    };
    faux.setResponses([recordUsers, recordUsers]);
    const session = await assembleHostSession({
      cwd: sessionDir,
      agentDir: join(sessionDir, "..", ".pi-agent"),
      modelRuntime,
      modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
      sessionDir,
      sessionFile: file,
    });
    sessions.push(session);

    // 在活会话上回退到第二问之前，再发一条：模型只看到第一问 + 新问题
    applySessionEdit(session.sessionManager, {
      kind: "rewind",
      entryId: userEntryId(file, sessionDir, 1),
    });
    session.refreshContext();
    await session.prompt("第二问（改）");
    expect(seen).toEqual(["第一问", "第二问（改）"]);

    // 同一个会话里切回原版本，继续聊：模型看到的是原路径
    const [original] = (
      piEntriesToDesktopMessages(loadSessionTranscript(file, sessionDir)).filter(
        message => message.role === "user"
      )[1] as RequestMessage
    ).piVersions!.ids;
    applySessionEdit(session.sessionManager, { kind: "switch", entryId: original });
    session.refreshContext();
    await session.prompt("接着原来的问");
    expect(seen).toEqual(["第一问", "第二问", "接着原来的问"]);
  });
});
