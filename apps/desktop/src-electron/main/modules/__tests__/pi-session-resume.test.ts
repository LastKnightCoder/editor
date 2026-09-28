/**
 * M4 会话事实源切到 pi JSONL：
 * - 真实会话跑完后落盘的 JSONL，能投影成桌面展示消息（工具循环合并成一条回答、工具结果回填）；
 * - 用同一文件重新装配会话（resume），pi 自己恢复上下文，模型看得到上一轮；
 * - 文件不存在（首轮没等到回答就失败）时按目录表 id 新建，不另起随机 id。
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  assembleHostSession,
  createFauxModelRuntime,
  loadSessionTranscript,
} from "../pi-session-host-core";
import { piEntriesToDesktopMessages } from "../pi-session-transcript";

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

const echoTool: ToolDefinition = {
  name: "echo",
  label: "echo",
  description: "回显",
  parameters: { type: "object", properties: { text: { type: "string" } } },
  execute: async (_id: string, params: unknown) => ({
    content: [{ type: "text", text: `回显：${(params as { text?: string }).text ?? ""}` }],
    details: undefined,
  }),
} as unknown as ToolDefinition;

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
  const workDir = mkdtempSync(join(tmpdir(), "pi-resume-"));
  workDirs.push(workDir);
  const sessionDir = join(workDir, "sessions");
  const faux = fauxProvider({});
  const modelRuntime = await createFauxModelRuntime(join(workDir, "auth.json"), faux);
  const assemble = async (extra: { sessionFile?: string; sessionId?: string } = {}) => {
    const session = await assembleHostSession({
      cwd: workDir,
      agentDir: join(workDir, ".pi-agent"),
      modelRuntime,
      modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
      sessionDir,
      customTools: [echoTool],
      ...extra,
    });
    sessions.push(session);
    return session;
  };
  return { faux, sessionDir, assemble };
};

describe("pi JSONL 事实源", () => {
  it("落盘的会话投影成桌面消息：工具循环合并成一条回答，工具结果回填到工具卡", async () => {
    const { faux, assemble } = await setup();
    faux.setResponses([
      fauxAssistantMessage([fauxText("先查一下"), fauxToolCall("echo", { text: "你好" })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage([fauxText("查完了")]),
    ]);
    const session = await assemble({ sessionId: "session-1" });
    await session.prompt("帮我查");
    const file = session.sessionFile as string;
    expect(existsSync(file)).toBe(true);
    expect(session.sessionId).toBe("session-1");

    const messages = piEntriesToDesktopMessages(loadSessionTranscript(file));
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "帮我查" }],
    });
    const answer = messages[1] as {
      role: string;
      content: string;
      assistant_blocks: Array<{ type: string; turnId: string; execution?: unknown }>;
    };
    expect(answer.role).toBe("assistant");
    // 两个 pi assistant message → 同一条回答的两个 turn
    expect(new Set(answer.assistant_blocks.map(block => block.turnId)).size).toBe(2);
    expect(answer.content).toContain("查完了");
    const toolBlock = answer.assistant_blocks.find(block => block.type === "tool_call");
    expect(toolBlock?.execution).toMatchObject({ status: "success", output: "回显：你好" });
  });

  it("用同一文件重新装配（resume）：历史由 pi 从 JSONL 恢复，模型看得到上一轮", async () => {
    const { faux, assemble } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("记住了：蓝色")])]);
    const first = await assemble({ sessionId: "session-2" });
    await first.prompt("我喜欢蓝色");
    const file = first.sessionFile as string;
    first.dispose();
    sessions.splice(sessions.indexOf(first), 1);

    let seenByModel: string[] = [];
    faux.setResponses([
      context => {
        seenByModel = context.messages
          .filter(message => message.role === "user")
          .map(message =>
            typeof message.content === "string"
              ? message.content
              : message.content
                  .filter(block => block.type === "text")
                  .map(block => (block as { text: string }).text)
                  .join("")
          );
        return fauxAssistantMessage([fauxText("你喜欢蓝色")]);
      },
    ]);
    const resumed = await assemble({ sessionFile: file });
    expect(resumed.sessionId).toBe("session-2");
    await resumed.prompt("我喜欢什么颜色？");

    expect(seenByModel).toEqual(["我喜欢蓝色", "我喜欢什么颜色？"]);
    // 续写在同一文件里，投影出两问两答
    const messages = piEntriesToDesktopMessages(loadSessionTranscript(file));
    expect(messages.map(message => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("会话文件还不存在时按目录表 id 新建，不另起随机 id", async () => {
    const { faux, sessionDir, assemble } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("好")])]);
    const missing = join(sessionDir, "never-written.jsonl");
    const session = await assemble({ sessionFile: missing, sessionId: "session-3" });
    expect(session.sessionId).toBe("session-3");
    await session.prompt("第一句");
    expect(readdirSync(sessionDir).some(name => name.includes("session-3"))).toBe(true);
  });
});

describe("重启后悬挂的工具调用（M4-e：标为已中断）", () => {
  /** 执行永远不返回的工具：模拟等待审批/作答时应用被关掉 */
  const hangingTool: ToolDefinition = {
    name: "hang",
    label: "hang",
    description: "挂起",
    parameters: { type: "object", properties: {} },
    execute: () => new Promise(() => {}),
  } as unknown as ToolDefinition;

  const crashWhileWaiting = async () => {
    const workDir = mkdtempSync(join(tmpdir(), "pi-dangling-"));
    workDirs.push(workDir);
    const sessionDir = join(workDir, "sessions");
    const faux = fauxProvider({});
    const modelRuntime = await createFauxModelRuntime(join(workDir, "auth.json"), faux);
    const assemble = async (sessionFile?: string) => {
      const session = await assembleHostSession({
        cwd: workDir,
        agentDir: join(workDir, ".pi-agent"),
        modelRuntime,
        modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
        sessionDir,
        customTools: [hangingTool],
        ...(sessionFile ? { sessionFile } : {}),
      });
      sessions.push(session);
      return session;
    };
    faux.setResponses([fauxAssistantMessage([fauxToolCall("hang", {}, { id: "call-hang" })])]);
    const first = await assemble();
    void first.prompt("去做一件要等的事");
    // 等 assistant(toolCall) 落盘，工具开始执行（永远挂着）
    for (let i = 0; i < 100 && !existsSync(first.sessionFile ?? ""); i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await new Promise(resolve => setTimeout(resolve, 50));
    const file = first.sessionFile!;
    // 「崩溃」：不 abort、不收尾，直接丢掉这个会话（文件里只有 toolCall 没有 toolResult）
    sessions.splice(sessions.indexOf(first), 1);
    first.dispose();
    return { faux, file, sessionDir, assemble };
  };

  it("重开时给悬挂调用补一条已中断的错误结果并落盘，工具卡投影成失败", async () => {
    const { file, sessionDir, assemble } = await crashWhileWaiting();
    const before = piEntriesToDesktopMessages(loadSessionTranscript(file, sessionDir));
    const beforeBlock = (
      before.at(-1) as { assistant_blocks?: Array<{ execution?: unknown }> }
    ).assistant_blocks?.find(block => "toolCall" in block);
    expect(beforeBlock?.execution).toBeUndefined();

    await assemble(file);

    const after = piEntriesToDesktopMessages(loadSessionTranscript(file, sessionDir));
    const block = (
      after.at(-1) as {
        assistant_blocks: Array<{
          type: string;
          execution?: { status: string; output?: string };
        }>;
      }
    ).assistant_blocks.find(item => item.type === "tool_call")!;
    expect(block.execution?.status).toBe("failed");
    expect(block.execution?.output).toContain("已中断");
  });

  it("补完之后对话照常继续，模型看到明确的中断说明；再开一次不重复补", async () => {
    const { faux, file, assemble } = await crashWhileWaiting();
    let seenResult = "";
    faux.setResponses([
      context => {
        const result = context.messages.find(message => message.role === "toolResult") as
          { content: Array<{ text?: string }> } | undefined;
        seenResult = result?.content.map(block => block.text ?? "").join("") ?? "";
        return fauxAssistantMessage([fauxText("好的，重新来")]);
      },
    ]);
    const resumed = await assemble(file);
    await resumed.prompt("继续");
    expect(seenResult).toContain("已中断");

    const countResults = () =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter(line => line.includes('"toolResult"')).length;
    const results = countResults();
    sessions.splice(sessions.indexOf(resumed), 1);
    resumed.dispose();
    await assemble(file);
    expect(countResults()).toBe(results);
  });
});
