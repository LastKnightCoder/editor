/**
 * 运行中插话（M3 第 5 项）：交 pi 原生 steer 队列的行为验证，真实 pi 会话 + faux provider。
 * 关注三件事：送达时机（当前步骤跑完、下一次请求模型之前，同一轮内）、
 * 会话空闲时不许偷偷起新一轮、中止后没送达的插话不能漏进下一轮。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionEvent,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  assembleHostSession,
  createFauxModelRuntime,
  steerHostSession,
} from "../pi-session-host-core";

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

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
};

/** 卡住的桥接工具：执行期间会话处于运行中，插话时机可控 */
const blockingTool = (gate: Promise<void>): ToolDefinition =>
  ({
    name: "blocker",
    label: "blocker",
    description: "等待外部放行",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      await gate;
      return { content: [{ type: "text", text: "放行" }] };
    },
  }) as unknown as ToolDefinition;

const userTextOf = (event: AgentSessionEvent): string =>
  event.type === "message_start" && event.message.role === "user"
    ? (event.message.content as Array<{ type: string; text?: string }>)
        .filter(block => block.type === "text")
        .map(block => block.text ?? "")
        .join("")
    : "";

const disposables: Array<{ session: AgentSession; workDir: string }> = [];
afterEach(async () => {
  for (const { session, workDir } of disposables.splice(0)) {
    await session.abort();
    session.dispose();
    rmSync(workDir, { recursive: true, force: true });
  }
});

const setupSession = async (options?: { customTools?: ToolDefinition[] }) => {
  const workDir = mkdtempSync(join(tmpdir(), "pi-插话-"));
  const agentDir = join(workDir, ".pi-agent");
  const faux = fauxProvider({});
  const modelRuntime = await createFauxModelRuntime(join(agentDir, "auth.json"), faux);
  const session = await assembleHostSession({
    cwd: workDir,
    agentDir,
    modelRuntime,
    modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
    ...(options?.customTools ? { customTools: options.customTools } : {}),
  });
  disposables.push({ session, workDir });
  const events: AgentSessionEvent[] = [];
  session.subscribe(event => events.push(event));
  return { session, faux, events };
};

describe("运行中插话（pi 原生 steer）", () => {
  it("工具执行中插话：在下一次请求模型前送达，仍属同一轮（只有一次 agent_settled）", async () => {
    const gate = deferred<void>();
    const { session, faux, events } = await setupSession({
      customTools: [blockingTool(gate.promise)],
    });
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("blocker", {})], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("按插话调整后的回答")]),
    ]);

    const run = session.prompt("原始问题");
    // 等工具真的开始执行（会话进入运行中且卡在工具里）
    while (!events.some(event => event.type === "tool_execution_start")) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    expect(await steerHostSession(session, "顺便也看下这个")).toEqual({ ok: true });
    expect(session.getSteeringMessages()).toEqual(["顺便也看下这个"]);

    gate.resolve();
    await run;

    const order = events.map(event =>
      event.type === "message_start" ? `message_start:${event.message.role}` : event.type
    );
    const toolEnd = order.indexOf("tool_execution_end");
    const steerAt = events.findIndex(event => userTextOf(event) === "顺便也看下这个");
    expect(steerAt).toBeGreaterThan(toolEnd);
    // 插话之后才是下一条 assistant 消息（即下一次请求模型）
    expect(order.slice(steerAt).indexOf("message_start:assistant")).toBeGreaterThan(0);
    expect(events.filter(event => event.type === "agent_settled")).toHaveLength(1);
    expect(session.getSteeringMessages()).toEqual([]);
  });

  it("会话空闲时拒绝插话，不偷偷起新一轮", async () => {
    const { session, faux, events } = await setupSession();
    faux.setResponses([fauxAssistantMessage([fauxText("空闲中的回答")])]);

    expect(await steerHostSession(session, "空闲插话")).toEqual({
      ok: false,
      reason: "not-streaming",
    });
    expect(events).toHaveLength(0);
    expect(session.getSteeringMessages()).toEqual([]);
  });

  it("中止会清空未送达的插话，不会漏进下一轮", async () => {
    const gate = deferred<void>();
    const { session, faux, events } = await setupSession({
      customTools: [blockingTool(gate.promise)],
    });
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("blocker", {})], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("不应到达")]),
    ]);

    const run = session.prompt("原始问题");
    while (!events.some(event => event.type === "tool_execution_start")) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(await steerHostSession(session, "来不及送达的插话")).toEqual({ ok: true });

    gate.resolve();
    await session.abort();
    await run;
    // 主进程 abort 处理器的收尾动作：把滞留的插话清出去交给渲染端退回队列
    expect(session.clearQueue()).toMatchObject({ steering: expect.any(Array) });
    expect(session.getSteeringMessages()).toEqual([]);

    faux.setResponses([fauxAssistantMessage([fauxText("下一轮的回答")])]);
    const nextEventsFrom = events.length;
    await session.prompt("下一个问题");
    const deliveredAfter = events
      .slice(nextEventsFrom)
      .map(event => userTextOf(event))
      .filter(Boolean);
    expect(deliveredAfter).toEqual(["下一个问题"]);
  });
});
