import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { assembleHostSession, createHostModelRuntime } from "../pi-session-host-core";
import { SubagentRepository } from "../pi-subagents/repository";
import { SubagentService, type SubagentHost } from "../pi-subagents/service";
import { SubagentResultCollector } from "../pi-subagents/state";

type Fault = "429" | "503" | "disconnect" | "truncated" | "malformed" | "hang";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
const chunk = (text: string, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: "local", object: "chat.completion.chunk", created: 0, model: "local-model", choices: [{ index: 0, delta: { content: text }, finish_reason: finish }] })}\n\n`;

async function setup(fault: Fault) {
  const dir = mkdtempSync(join(tmpdir(), "tau-agent-network-"));
  let healthy = false;
  let requests = 0;
  const bodies: string[] = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
    });
    request.on("end", () => {
      requests += 1;
      bodies.push(body);
      if (!healthy && (fault === "429" || fault === "503")) {
        response.writeHead(Number(fault), { "content-type": "application/json" });
        response.end(
          JSON.stringify({ error: { message: `本地模拟错误 ${fault}`, type: "server_error" } })
        );
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (healthy) {
        response.end(`${chunk("恢复完成")}${chunk("", "stop")}data: [DONE]\n\n`);
        return;
      }
      if (fault === "hang") {
        response.flushHeaders();
        return;
      }
      if (fault === "malformed") {
        response.end("data: not-json\n\n");
        return;
      }
      response.write(chunk("部分输出"));
      if (fault === "disconnect") setTimeout(() => response.destroy(), 10);
      else response.end();
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const modelRuntime = await createHostModelRuntime(join(dir, "auth.json"), [
    {
      id: "local-pressure",
      name: "本地压测网关",
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: "local-test",
      api: "openai-completions",
      models: [
        {
          id: "local-model",
          reasoning: false,
          input: ["text"],
          contextWindow: 65536,
          maxTokens: 4096,
        },
      ],
    },
  ]);
  const sessions = new Map<string, AgentSession>();
  const parent = {
    key: "network-parent",
    hostId: "parent",
    scope: "main",
    databaseName: "test",
    cwd: dir,
    branchId: null,
  };
  const host: SubagentHost = {
    parent: () => parent,
    execute: async (_parent, agent, run, signal) => {
      let session = sessions.get(agent.agentId);
      if (!session) {
        session = await assembleHostSession({
          cwd: dir,
          agentDir: dir,
          modelRuntime,
          modelRef: { providerId: "local-pressure", modelId: "local-model" },
          sessionDir: join(dir, "sessions"),
          sessionId: agent.agentId,
          retry: { maxRetries: 0 },
        });
        sessions.set(agent.agentId, session);
      }
      const collector = new SubagentResultCollector();
      const unsubscribe = session.subscribe(event => collector.accept(event));
      const abort = () => {
        void session.abort();
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        signal.throwIfAborted();
        await session.prompt(run.input);
        return collector.result();
      } finally {
        signal.removeEventListener("abort", abort);
        unsubscribe();
      }
    },
    deliver: vi.fn(async () => true),
    changed: () => undefined,
  };
  const service = new SubagentService(new SubagentRepository(join(dir, "records")), host);
  cleanups.push(async () => {
    await service.stopParent(parent.key);
    for (const session of sessions.values()) {
      await session.abort();
      session.dispose();
    }
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await new Promise<void>(resolve => setImmediate(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    service,
    parent,
    sessions,
    requests: () => requests,
    bodies,
    recover: () => {
      healthy = true;
    },
  };
}

describe("子 Agent 本地 HTTP 故障", () => {
  it.each(["429", "503", "disconnect", "truncated", "malformed"] as const)(
    "%s 原因上报且不自动重试，父明确继续后复用会话",
    async fault => {
      const h = await setup(fault);
      const run = h.service.submit("parent", "first", {
        title: "网络任务",
        message: "原任务标记",
        mode: "sync",
      });
      const result = await h.service.wait(run, "first", undefined, 10000);
      expect(result).toMatchObject({
        reason: "terminal",
        outcome: { status: "failed", error: { message: expect.any(String) } },
      });
      expect(h.requests()).toBe(1);
      h.service.toolResult(h.parent.key, "first", true);
      h.recover();
      const next = h.service.submit("parent", "continue", {
        agentId: run.agentId,
        message: "继续原任务",
        mode: "sync",
      });
      expect(await h.service.wait(next, "continue", undefined, 10000)).toMatchObject({
        reason: "terminal",
        outcome: { status: "completed", result: "恢复完成" },
      });
      h.service.toolResult(h.parent.key, "continue", true);
      expect(h.requests()).toBe(2);
      expect(h.bodies[1]).toContain("原任务标记");
      expect(h.bodies[1]).toContain("继续原任务");
      expect(JSON.stringify(h.sessions.get(run.agentId)!.sessionManager.getBranch())).toContain(
        "原任务标记"
      );
      console.log(
        "SUBAGENT_NETWORK",
        JSON.stringify({
          fault,
          requests: h.requests(),
          failure: result.reason === "terminal" ? result.outcome : result,
        })
      );
    },
    20000
  );

  it("服务端挂起时取消会释放流和执行槽，后续消息仍可运行", async () => {
    const h = await setup("hang");
    const run = h.service.submit("parent", "hang", {
      title: "挂起",
      message: "等待响应",
      mode: "sync",
    });
    await vi.waitFor(() => expect(h.requests()).toBe(1));
    await h.service.cancel(run);
    expect(await h.service.wait(run, "hang")).toMatchObject({ outcome: { status: "cancelled" } });
    h.service.toolResult(h.parent.key, "hang", true);
    await vi.waitFor(() => expect(h.sessions.get(run.agentId)?.isStreaming).toBe(false));
    h.recover();
    const next = h.service.submit("parent", "after-hang", {
      agentId: run.agentId,
      message: "继续",
      mode: "sync",
    });
    expect(await h.service.wait(next, "after-hang", undefined, 10000)).toMatchObject({
      outcome: { status: "completed" },
    });
    h.service.toolResult(h.parent.key, "after-hang", true);
  }, 20000);
});
