// @vitest-environment node
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { normalizeContext } from "@earendil-works/pi-ai";
import { collectModelStream, createModelTaskIdentity } from "@tau/ai/model-request";
import { createModelStream } from "../../../../packages/ai/src/runtime/stream";
import {
  protocolResponse,
  protocolToolResponse,
} from "../../../../packages/ai/src/__tests__/model-request-fixtures";
import { createProviderRegistry } from "../main/modules/pi-ai-runtime-core";
import { executeSingleShot } from "../main/modules/pi-ai-single-shot";
import { assembleHostSession, createHostModelRuntime } from "../main/modules/pi-session-host-core";
import type { LLMProviderSetting, PiApiKind } from "@/types/pi-llm";

const enabled = process.env.TAU_AI_REQUEST_STRESS === "1";
const live = process.env.TAU_AI_REQUEST_LIVE === "1";
const protocols: PiApiKind[] = ["openai-completions", "openai-responses", "anthropic-messages"];
const context = normalizeContext({
  messages: [{ role: "user" as const, content: "只回复42", timestamp: 0 }],
});
const reportDir = join(process.cwd(), "../../output/ai-model-request");
function report(name: string, value: unknown) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, `${name}.json`), JSON.stringify(value, null, 2) + "\n");
  console.info(name, JSON.stringify(value));
}
async function parallel<T>(
  items: T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<void>
) {
  let index = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (index < items.length) {
        const current = index++;
        await run(items[current], current);
      }
    })
  );
}
const addTool = (executed: () => void): ToolDefinition => ({
  name: "contract_add",
  label: "合成加法",
  description: "Add two synthetic integers. Use this tool for 19+23.",
  parameters: {
    type: "object",
    properties: { left: { type: "number" }, right: { type: "number" } },
    required: ["left", "right"],
  },
  execute: async (_id: string, args: Record<string, number>) => {
    executed();
    return {
      content: [{ type: "text" as const, text: String(args.left + args.right) }],
      details: {},
    };
  },
});

it.skipIf(!enabled)(
  "本地三协议并发覆盖桌面单发、原生托管与主对话工具循环",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "tau-ai-pressure-"));
    const observations: Array<{ route: string; api: string }> = [];
    const server = http.createServer(async (request, response) => {
      let body = "";
      for await (const part of request) body += part;
      const route = request.headers["x-opencode-session"];
      assert.equal(typeof route, "string");
      const api = request.headers["x-contract-api"] as PiApiKind;
      assert(protocols.includes(api));
      observations.push({ route: route as string, api });
      const payload = JSON.parse(body);
      const hasTool = JSON.stringify(payload.tools ?? []).includes("contract_add");
      const hasResult = /"tool_result"|"function_call_output"|"role":"tool"/.test(body);
      const result =
        hasTool && !hasResult ? protocolToolResponse(api) : protocolResponse(api, "42");
      response.writeHead(200, { "content-type": "text/event-stream" });
      const bytes = new TextEncoder().encode(await result.text());
      for (let offset = 0; offset < bytes.length; offset += 37) {
        response.write(bytes.slice(offset, offset + 37));
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      response.end();
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert(address && typeof address !== "string");
    const setting: LLMProviderSetting = {
      id: "opencode-go",
      name: "本地模拟网关",
      api: "openai-completions",
      apiKey: "synthetic-only",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      models: protocols.map(api => ({
        id: `contract-${api}`,
        api,
        reasoning: false,
        input: ["text"],
        contextWindow: 8192,
        maxTokens: 512,
        headers: { "X-Contract-Api": api },
      })),
    };
    const latencies: number[] = [];
    let audited = 0;
    let toolCalls = 0;
    const started = performance.now();
    try {
      const registry = createProviderRegistry();
      await registry.syncProviders([setting]);
      const rounds = Number(process.env.TAU_AI_REQUEST_ROUNDS ?? 60);
      assert(Number.isInteger(rounds) && rounds > 0 && rounds <= 1000);
      const jobs = protocols.flatMap(api => Array.from({ length: rounds }, () => api));
      await parallel(jobs, 12, async (api, index) => {
        const before = performance.now();
        const request = {
          requestId: `desktop-${index}`,
          providerId: setting.id,
          modelId: `contract-${api}`,
          messages: [{ role: "user" as const, content: "合成压测" }],
        };
        const result = await executeSingleShot(registry, request, event => {
          assert.equal(event.status, "ok");
          audited++;
        });
        assert(result.ok, result.error);
        latencies.push(performance.now() - before);
      });
      await parallel(jobs, 12, async (api, index) => {
        const model = registry.resolveModel(setting.id, `contract-${api}`);
        assert(model);
        const result = await collectModelStream(
          await createModelStream(fetch)(model, context, { sessionId: `mobile-${index}` })
        );
        assert.equal(result.outcome, "completed", result.error);
      });
      const runtime = await createHostModelRuntime(join(dir, "auth.json"), [setting]);
      await parallel(
        protocols.flatMap(api => Array.from({ length: 4 }, () => api)),
        3,
        async (api, index) => {
          const session = await assembleHostSession({
            cwd: dir,
            agentDir: dir,
            modelRuntime: runtime,
            modelRef: { providerId: setting.id, modelId: `contract-${api}` },
            sessionId: `host-${index}`,
            customTools: [addTool(() => toolCalls++)],
            retry: { maxRetries: 0 },
          });
          try {
            session.setActiveToolsByName(["contract_add"]);
            await session.prompt("Use contract_add for 19+23, then reply 42.");
            assert(
              session.messages.some(
                message => message.role === "assistant" && JSON.stringify(message).includes("42")
              )
            );
          } finally {
            session.dispose();
          }
        }
      );
      expect(toolCalls).toBe(12);
      expect(audited).toBe(jobs.length);
      const routingCounts = new Map<string, number>();
      for (const entry of observations)
        routingCounts.set(entry.route, (routingCounts.get(entry.route) ?? 0) + 1);
      expect(
        [...routingCounts]
          .filter(([route]) => route.startsWith("host-"))
          .every(([, count]) => count === 2)
      ).toBe(true);
      expect(routingCounts.size).toBe(jobs.length * 2 + 12);
      latencies.sort((a, b) => a - b);
      report("local-pressure", {
        requests: observations.length,
        desktopTasks: jobs.length,
        mobileTasks: jobs.length,
        hostTasks: 12,
        toolCalls,
        audited,
        protocols,
        maxConcurrency: 12,
        elapsedMs: Math.round(performance.now() - started),
        p95DesktopMs: Math.round(latencies[Math.floor(latencies.length * 0.95)]),
        outcome: "passed",
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  },
  120_000
);

it.skipIf(!live)(
  "本机配置模型在桌面、原生托管与主对话路径上完成真实请求",
  async () => {
    const settingPath = process.env.KL_SETTING ?? join(homedir(), ".editor", "setting.json");
    const setting = JSON.parse(readFileSync(settingPath, "utf8"));
    const excluded = new Set((process.env.TAU_AI_SKIP_PROVIDERS ?? "").split(",").filter(Boolean));
    const providers = (setting.llmProviders as LLMProviderSetting[]).filter(
      provider => provider.apiKey && provider.models.length && !excluded.has(provider.name)
    );
    const registry = createProviderRegistry();
    await registry.syncProviders(providers);
    const dir = mkdtempSync(join(tmpdir(), "tau-ai-live-"));
    const runtime = await createHostModelRuntime(join(dir, "auth.json"), providers);
    const results: Array<{
      provider: string;
      model: string;
      api: string;
      path: string;
      ok: boolean;
      latencyMs: number;
      error?: string;
    }> = [];
    try {
      for (const provider of providers) {
        const configured = provider.models[0];
        const model = registry.resolveModel(provider.id, configured.id);
        if (!model) continue;
        for (const path of ["desktop", "native", "host"]) {
          const started = performance.now();
          let error: string | undefined;
          try {
            if (path === "desktop") {
              const result = await executeSingleShot(
                registry,
                {
                  requestId: crypto.randomUUID(),
                  providerId: provider.id,
                  modelId: configured.id,
                  maxOutputTokens: 1024,
                  messages: [{ role: "user", content: "只输出数字42，不要解释。" }],
                  source: { feature: "verification", library: "synthetic", entityId: path },
                },
                () => undefined,
                AbortSignal.timeout(90_000)
              );
              assert(result.ok, result.error);
              assert(
                JSON.stringify(result.message?.content).includes("42"),
                "未得到要求的合成结果"
              );
            } else if (path === "native") {
              const transport: typeof globalThis.fetch = async (input, init) => {
                const request = new Request(input, init);
                request.headers.delete("authorization");
                request.headers.delete("x-api-key");
                request.headers.set(
                  model.api === "anthropic-messages" ? "x-api-key" : "authorization",
                  model.api === "anthropic-messages" ? provider.apiKey : `Bearer ${provider.apiKey}`
                );
                return fetch(request);
              };
              const result = await collectModelStream(
                await createModelStream(transport)(model, context, {
                  sessionId: createModelTaskIdentity().routingId,
                  maxTokens: 1024,
                  maxRetries: 0,
                  signal: AbortSignal.timeout(90_000),
                })
              );
              assert.equal(result.outcome, "completed", result.error);
              assert(
                JSON.stringify(result.message?.content).includes("42"),
                "未得到要求的合成结果"
              );
            } else {
              const session = await assembleHostSession({
                cwd: dir,
                agentDir: dir,
                modelRuntime: runtime,
                modelRef: { providerId: provider.id, modelId: configured.id },
                retry: { maxRetries: 0 },
                customTools: [addTool(() => undefined)],
              });
              const timer = setTimeout(() => void session.abort(), 90_000);
              try {
                session.setActiveToolsByName(["contract_add"]);
                await session.prompt(
                  "Call contract_add with left=19 and right=23, then output only its result."
                );
                assert(
                  session.messages.some(message => message.role === "toolResult"),
                  "未完成工具调用"
                );
                assert(
                  session.messages.some(
                    message =>
                      message.role === "assistant" && JSON.stringify(message).includes("42")
                  ),
                  "未完成工具后回答"
                );
              } finally {
                clearTimeout(timer);
                session.dispose();
              }
            }
          } catch (caught) {
            // 错误报告不输出可能包含凭据的网络异常详情。
            error =
              caught instanceof assert.AssertionError
                ? caught.message.slice(0, 300)
                : "模型请求或传输失败";
          }
          results.push({
            provider: provider.name,
            model: configured.id,
            api: model.api,
            path,
            ok: !error,
            latencyMs: Math.round(performance.now() - started),
            ...(error ? { error } : {}),
          });
          console.info("live-progress", provider.name, path, error ? "failed" : "passed");
        }
      }
      report("live-models", {
        input: "synthetic only",
        results,
        passed: results.filter(row => row.ok).length,
        failed: results.filter(row => !row.ok).length,
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results.filter(row => !row.ok)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  1_500_000
);

it.skipIf(process.env.TAU_AI_REQUEST_CONCURRENT !== "1")(
  "已配置功能模型完成有界真实并发与独立任务审计",
  async () => {
    const setting = JSON.parse(
      readFileSync(process.env.KL_SETTING ?? join(homedir(), ".editor", "setting.json"), "utf8")
    );
    const registry = createProviderRegistry();
    await registry.syncProviders(setting.llmProviders);
    const features = [
      "titleSummary",
      "assistantMemory",
      "contentMetadata",
      "inlineSuggestion",
      "speechInputRefinement",
      "flashcardGeneration",
    ];
    const jobs = features.flatMap(feature =>
      Array.from({ length: 2 }, () => ({ feature, model: setting.llmUsageSettings[feature] }))
    );
    const records: Array<{ routingId?: string | null; status: string }> = [];
    const results: Array<{ feature: string; ok: boolean; latencyMs: number; error?: string }> = [];
    await parallel(jobs, 2, async ({ feature, model }) => {
      assert(model, `功能未分配模型：${feature}`);
      const started = performance.now();
      const outcome = await executeSingleShot(
        registry,
        {
          requestId: crypto.randomUUID(),
          providerId: model.providerId,
          modelId: model.modelId,
          thinking: model.thinkingLevel,
          maxOutputTokens: 1024,
          task: createModelTaskIdentity(),
          source: { feature, library: "synthetic-verification" },
          messages: [{ role: "user", content: "只输出数字42，不要解释。" }],
        },
        record => records.push(record),
        AbortSignal.timeout(90_000)
      );
      results.push({
        feature,
        ok: outcome.ok && JSON.stringify(outcome.message?.content).includes("42"),
        latencyMs: Math.round(performance.now() - started),
        ...(outcome.error ? { error: outcome.error.slice(0, 300) } : {}),
      });
    });
    report("live-concurrent", {
      maxConcurrency: 2,
      tasks: jobs.length,
      audited: records.length,
      results,
    });
    expect(records).toHaveLength(jobs.length);
    expect(new Set(records.map(record => record.routingId)).size).toBe(jobs.length);
    expect(results.filter(result => !result.ok)).toEqual([]);
  },
  720_000
);

it.skipIf(process.env.TAU_AI_REQUEST_ANTHROPIC !== "1")(
  "配置端点的 Anthropic 协议在三个执行出口上保持可用",
  async () => {
    const setting = JSON.parse(
      readFileSync(process.env.KL_SETTING ?? join(homedir(), ".editor", "setting.json"), "utf8")
    );
    const configured = (setting.llmProviders as LLMProviderSetting[]).find(
      provider => provider.api === "anthropic-messages" && provider.apiKey
    );
    assert(configured, "没有配置 Anthropic 协议端点");
    const registry = createProviderRegistry();
    await registry.syncProviders([configured]);
    const catalog = registry.resolveModel(configured.id, configured.models[0].id);
    assert(catalog);
    const provider: LLMProviderSetting = {
      ...configured,
      id: "synthetic-anthropic-check",
      builtin: "synthetic-custom",
      models: [
        {
          ...configured.models[0],
          api: "anthropic-messages",
          contextWindow: catalog.contextWindow,
          maxTokens: catalog.maxTokens,
        },
      ],
    };
    await registry.syncProviders([provider]);
    const model = registry.resolveModel(provider.id, provider.models[0].id);
    assert(model);
    const results: Array<{ path: string; ok: boolean; error?: string }> = [];
    const desktop = await executeSingleShot(
      registry,
      {
        requestId: crypto.randomUUID(),
        providerId: provider.id,
        modelId: model.id,
        maxOutputTokens: 1024,
        messages: [{ role: "user", content: "只输出数字42，不要解释。" }],
      },
      () => undefined,
      AbortSignal.timeout(90_000)
    );
    results.push({
      path: "desktop",
      ok: desktop.ok && JSON.stringify(desktop.message?.content).includes("42"),
      ...(desktop.error ? { error: desktop.error.slice(0, 300) } : {}),
    });
    const transport: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      request.headers.delete("authorization");
      request.headers.set("x-api-key", provider.apiKey);
      return fetch(request);
    };
    const native = await collectModelStream(
      await createModelStream(transport)(model, context, {
        maxTokens: 1024,
        maxRetries: 0,
        signal: AbortSignal.timeout(90_000),
      })
    );
    results.push({
      path: "native",
      ok: native.outcome === "completed" && JSON.stringify(native.message?.content).includes("42"),
      ...(native.error ? { error: native.error.slice(0, 300) } : {}),
    });
    const dir = mkdtempSync(join(tmpdir(), "tau-anthropic-check-"));
    try {
      const runtime = await createHostModelRuntime(join(dir, "auth.json"), [provider]);
      const session = await assembleHostSession({
        cwd: dir,
        agentDir: dir,
        modelRuntime: runtime,
        modelRef: { providerId: provider.id, modelId: model.id },
        retry: { maxRetries: 0 },
        customTools: [addTool(() => undefined)],
      });
      const timer = setTimeout(() => void session.abort(), 90_000);
      try {
        session.setActiveToolsByName(["contract_add"]);
        await session.prompt(
          "Call contract_add with left=19 and right=23, then output only its result."
        );
        results.push({
          path: "host",
          ok:
            session.messages.some(message => message.role === "toolResult") &&
            session.messages.some(
              message => message.role === "assistant" && JSON.stringify(message).includes("42")
            ),
        });
      } finally {
        clearTimeout(timer);
        session.dispose();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    report("live-anthropic", { input: "synthetic only; settings unchanged", results });
    expect(results.filter(result => !result.ok)).toEqual([]);
  },
  300_000
);
