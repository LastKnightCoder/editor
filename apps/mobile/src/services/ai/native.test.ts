import { afterEach, expect, it, vi } from "vitest";
import { commitSession, createModelFetch, setRunActive } from "./native";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const lease = { leaseId: "lease-1", databaseName: "test.db", generation: 1 };
afterEach(() => vi.resetAllMocks());

it("大提交按受限块传输，失败后释放暂存文件", async () => {
  let uploaded = 0;
  invoke.mockImplementation(async (command, args) => {
    if (command === "ai_session_stage_open") return "stage-1";
    if (command === "ai_session_stage_write") {
      expect(args.data.length).toBeLessThan(100_000);
      expect(args.offset).toBe(uploaded);
      uploaded += atob(args.data).length;
      return;
    }
    if (command === "ai_session_stage_finish" && !args.discard)
      throw new Error("AI_SESSION_REVISION_CONFLICT");
  });
  await expect(
    commitSession(lease, {
      sessionId: "session",
      operationId: "operation",
      expectedRevision: "old",
      entries: [{ id: "entry", content: "中文".repeat(70_000) }],
    })
  ).rejects.toThrow("REVISION_CONFLICT");
  expect(uploaded).toBeGreaterThan(128_000);
  expect(invoke).toHaveBeenLastCalledWith("ai_session_stage_finish", {
    leaseId: "lease-1",
    id: "stage-1",
    discard: true,
  });
});

it("原生网络桥按字节收流、上传请求体并在 EOF 释放", async () => {
  const bytes = new TextEncoder().encode("data: 中文分片\n\n");
  const chunks = [bytes.slice(0, 8), bytes.slice(8), null];
  invoke.mockImplementation(async command => {
    if (command === "ai_http_context")
      return {
        contextId: "context",
        config: { llmProviders: [{ id: "p", models: [{ id: "m" }] }], llmUsageSettings: {} },
      };
    if (command === "ai_http_open") return "transfer";
    if (command === "ai_http_response")
      return {
        status: 200,
        statusText: "OK",
        headers: [["content-type", "text/event-stream"]],
        hasBody: true,
      };
    if (command === "ai_http_read") {
      const chunk = chunks.shift();
      return chunk ? btoa(String.fromCharCode(...chunk)) : null;
    }
  });
  const transport = await createModelFetch(lease, "provider", "model");
  expect(transport.config.llmProviders[0].id).toBe("p");
  const response = await transport.fetch("https://example.test/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ prompt: "问题" }),
  });
  expect(await response.text()).toBe("data: 中文分片\n\n");
  expect(invoke).toHaveBeenCalledWith("ai_http_upload", { id: "transfer", chunk: null });
  await transport.dispose();
  await transport.dispose();
  expect(invoke.mock.calls.filter(([command]) => command === "ai_http_dispose")).toHaveLength(1);
  await expect(transport.fetch("https://example.test")).rejects.toThrow("已释放");
});

it("运行占用显式携带会话身份", async () => {
  await setRunActive(lease, "run-1", true, "session-1");
  expect(invoke).toHaveBeenCalledWith("ai_run_active", {
    leaseId: "lease-1",
    runId: "run-1",
    active: true,
    sessionId: "session-1",
  });
});
