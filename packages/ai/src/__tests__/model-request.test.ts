import { expect, it } from "vitest";
import { createModels, normalizeContext } from "@earendil-works/pi-ai";
import {
  collectModelStream,
  createModelRequestProvider,
  createModelTaskIdentity,
  createScopedModelTaskIdentity,
  streamModelRequest,
} from "../model-request";
import { createModelStream } from "../runtime/stream";
import { protocolResponse, requestModel } from "./model-request-fixtures";
import type { PiApiKind } from "../models";

const protocols: PiApiKind[] = ["openai-completions", "openai-responses", "anthropic-messages"];
const context = normalizeContext({
  systemPrompt: "保持原有指令",
  messages: [{ role: "user" as const, content: "合成输入", timestamp: 0 }],
});

// 后台单发曾漏传会话路由，OpenCode Go 拒绝了标题与记忆请求。
it.each(protocols)("%s 的公共出口保留路由、覆盖项、观察钩子与最终结果", async api => {
  const model = requestModel(api);
  const requests: Request[] = [];
  const payloads: unknown[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    payloads.push(await request.json());
    return protocolResponse(api);
  };
  const models = createModels();
  models.setProvider(
    createModelRequestProvider({
      id: model.provider,
      models: [model],
      auth: {
        apiKey: {
          name: "test",
          resolve: async () => ({ auth: { apiKey: "test-only" }, source: "test" }),
        },
      },
    })
  );
  let observedStatus: number | undefined;
  const result = await collectModelStream(
    streamModelRequest(models, model, context, {
      sessionId: "logical-task-A",
      fetch,
      maxTokens: 128,
      temperature: 0.25,
      headers: { "User-Agent": "ConfiguredClient/1", "X-Task": "kept" },
      onResponse: response => {
        observedStatus = response.status;
      },
    })
  );
  expect(result.outcome).toBe("completed");
  expect(
    result.message?.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("")
  ).toBe("契约验证完成");
  expect(result.message?.usage.totalTokens).toBe(12);
  expect(requests.map(request => request.headers.get("x-opencode-session"))).toEqual([
    "logical-task-A",
  ]);
  expect(requests[0].headers.get("user-agent")).toBe("ConfiguredClient/1");
  expect(requests[0].headers.get("x-task")).toBe("kept");
  expect(observedStatus).toBe(200);
  expect(JSON.stringify(payloads)).toContain("保持原有指令");
  const payload = payloads[0] as Record<string, unknown>;
  expect(
    payload[api === "openai-responses" ? "max_output_tokens" : "max_tokens"] ??
      payload.max_completion_tokens
  ).toBe(128);
});

it.each(protocols)("%s 的原生托管传输经过相同出口，不需要在脚本中持有真实密钥", async api => {
  const captured: Headers[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    captured.push(new Request(input, init).headers);
    return protocolResponse(api);
  };
  const task = createModelTaskIdentity();
  const stream = createModelStream(fetch);
  for (let turn = 0; turn < 2; turn++) {
    const result = await collectModelStream(
      await stream(requestModel(api), context, { sessionId: task.routingId })
    );
    expect(result.outcome).toBe("completed");
  }
  expect(captured.map(headers => headers.get("x-opencode-session"))).toEqual([
    task.routingId,
    task.routingId,
  ]);
});

it("任务身份跨重试稳定，资料库和任务边界隔离且不泄露来源名称", async () => {
  const first = await createScopedModelTaskIdentity(["私人资料库", "title", "chat-A"]);
  expect(await createScopedModelTaskIdentity(["私人资料库", "title", "chat-A"])).toEqual(first);
  expect(await createScopedModelTaskIdentity(["另一个库", "title", "chat-A"])).not.toEqual(first);
  expect(await createScopedModelTaskIdentity(["私人资料库", "memory", "chat-A"])).not.toEqual(
    first
  );
  expect(first.routingId).not.toContain("私人资料库");
  expect(createModelTaskIdentity()).not.toEqual(createModelTaskIdentity());
  expect(() => createModelTaskIdentity("\r\ninvalid")).toThrow();
});

it("永久 HTTP 错误保留原因且不被标为成功", async () => {
  let calls = 0;
  const fetch: typeof globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: { message: "MissingSessionID regression" } }), {
      status: 400,
    });
  };
  const result = await collectModelStream(
    await createModelStream(fetch)(requestModel("openai-completions"), context)
  );
  expect(result.outcome).toBe("failed");
  expect(result.message).toBeNull();
  expect(result.error).toContain("MissingSessionID");
  expect(calls).toBe(1);
});

it("已取消的请求不发送网络，未返回完成事件的流也不报成功", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const fetch: typeof globalThis.fetch = async () => {
    calls++;
    return protocolResponse("openai-completions");
  };
  const result = await collectModelStream(
    await createModelStream(fetch)(requestModel("openai-completions"), context, {
      signal: controller.signal,
    }),
    controller.signal
  );
  expect(result.outcome).toBe("aborted");
  expect(calls).toBe(0);
  const empty = await collectModelStream(
    (async function* () {
      yield* [];
    })()
  );
  expect(empty.outcome).toBe("failed");
  expect(empty.message).toBeNull();
});

it("流式传输中的取消终止等待并返回 aborted", async () => {
  let entered: (() => void) | undefined;
  const started = new Promise<void>(resolve => {
    entered = resolve;
  });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    return new Promise<Response>((_resolve, reject) => {
      request.signal.addEventListener(
        "abort",
        () => reject(new DOMException("已取消", "AbortError")),
        { once: true }
      );
      entered?.();
    });
  };
  const controller = new AbortController();
  const result = collectModelStream(
    await createModelStream(fetch)(requestModel("openai-completions"), context, {
      signal: controller.signal,
    }),
    controller.signal
  );
  await started;
  controller.abort();
  expect(await result).toMatchObject({ outcome: "aborted", message: null });
});
