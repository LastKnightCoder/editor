import { expect, it } from "vitest";
import { AiRuntime } from "../runtime";
import { AiToolRegistry } from "../../tools";
import { parseSessionFile, projectSessionMessages, serializeSessionFile } from "../../session";
import { memoryStore, model, network, request, resolved } from "./fixtures";
import type { AiGenerationRequest } from "../types";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const dataUrl = `data:image/png;base64,${png}`;

it("真实SDK把dataURL图片序列化为image_url，v3重读仍保留图片字节与展示引用", async () => {
  const store = memoryStore();
  const api = network([{ text: "图片已收到。" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => ({
      ...resolved(api.fetch),
      model: { ...model, input: ["text", "image"] },
    }),
  });
  const input = request(store.read().revision, {
    message: [
      { type: "text", text: "描述图片" },
      { type: "image", image: dataUrl, path: "/desktop/original.png" },
    ],
  });
  const result = await (await runtime.start(input)).result;
  expect(result.outcome).toBe("completed");
  expect(api.requests).toHaveLength(1);
  const messages = api.requests[0].messages as Array<{ role: string; content: unknown }>;
  expect(messages.find(message => message.role === "user")?.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "text", text: "描述图片" }),
      expect.objectContaining({
        type: "image_url",
        image_url: expect.objectContaining({ url: dataUrl }),
      }),
    ])
  );
  expect(JSON.stringify(api.requests[0])).not.toContain("/desktop/original.png");
  const reread = parseSessionFile(serializeSessionFile(store.read().document));
  expect(reread.entries.find(entry => entry.message?.role === "user")?.message?.content).toEqual(
    expect.arrayContaining([{ type: "image", mimeType: "image/png", data: png }])
  );
  const user = projectSessionMessages(reread).find(message => message.role === "user");
  expect(user?.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "image", image: dataUrl, path: "/desktop/original.png" }),
    ])
  );
});

it.each(["/device/photo.png", "https://images.example.invalid/photo.png"])(
  "无宿主解析时明确拒绝图片路径或URL %s，不能直接发给模型",
  async image => {
    const store = memoryStore();
    const api = network([{ text: "不应请求" }]);
    const runtime = new AiRuntime({
      store: store.store,
      tools: new AiToolRegistry(),
      resolveModel: async () => ({
        ...resolved(api.fetch),
        model: { ...model, input: ["text", "image"] },
      }),
    });
    await expect(
      runtime.start(
        request(store.read().revision, {
          message: [{ type: "image", image }],
        })
      )
    ).rejects.toMatchObject({ code: "AI_ATTACHMENT_UNAVAILABLE" });
    expect(api.requests).toHaveLength(0);
    expect(store.read().document.entries.some(entry => entry.message?.role === "user")).toBe(false);
  }
);

it("文本模型必须在发送前拒绝图片，不能由SDK静默丢弃", async () => {
  const store = memoryStore();
  const api = network([{ text: "不应请求" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
  });
  const failure = await runtime
    .start(
      request(store.read().revision, {
        message: [
          { type: "text", text: "描述图片" },
          { type: "image", image: dataUrl },
        ],
      })
    )
    .then(
      async handle => {
        await handle.result;
        return null;
      },
      error => error
    );
  expect(failure).toMatchObject({ name: "AiError" });
  expect(failure.message).toMatch(/图片|图像|image/i);
  expect(api.requests).toHaveLength(0);
  expect(store.read().document.entries.some(entry => entry.message?.role === "user")).toBe(false);
});

it("宿主prepareInput返回图片时同样检查模型模态能力", async () => {
  const store = memoryStore();
  const api = network([{ text: "不应请求" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
    prepareInput: async () => [{ type: "image", mimeType: "image/png", data: png }],
  });
  const failure = await runtime.start(request(store.read().revision)).then(
    async handle => {
      await handle.result;
      return null;
    },
    error => error
  );
  expect(failure).toMatchObject({ name: "AiError" });
  expect(failure.message).toMatch(/图片|图像|image/i);
  expect(api.requests).toHaveLength(0);
});

it("单发user图片使用与桌面相同的images字段，经SDK发送且不创建持久消息", async () => {
  const store = memoryStore();
  const api = network([{ text: "图片已收到。" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => ({
      ...resolved(api.fetch),
      model: { ...model, input: ["text", "image"] },
    }),
  });
  const result = await (
    await runtime.generate({
      requestId: "generation-image-1",
      databaseName: "validation.db",
      model: { providerId: "validation", modelId: model.id },
      messages: [
        { role: "user", content: "描述图片", images: [{ data: png, mimeType: "image/png" }] },
      ],
    })
  ).result;
  expect(result.outcome).toBe("completed");
  const messages = api.requests[0].messages as Array<{ role: string; content: unknown }>;
  expect(messages.find(message => message.role === "user")?.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "image_url",
        image_url: expect.objectContaining({ url: dataUrl }),
      }),
    ])
  );
  expect(store.read().document.entries).toHaveLength(0);
});

it("单发文本模型拒绝user图片，不静默删除images字段", async () => {
  const store = memoryStore();
  const api = network([{ text: "不应请求" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
  });
  const result = await (
    await runtime.generate({
      requestId: "generation-image-2",
      databaseName: "validation.db",
      model: { providerId: "validation", modelId: model.id },
      messages: [
        { role: "user", content: "描述图片", images: [{ data: png, mimeType: "image/png" }] },
      ],
    })
  ).result;
  expect(result.outcome).toBe("failed");
  expect(result.error?.message).toMatch(/图片|图像|image/i);
  expect(api.requests).toHaveLength(0);
});

it("单发assistant误传图片时明确拒绝，不把它当成用户图片发送", async () => {
  const store = memoryStore();
  const api = network([{ text: "不应请求" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => ({
      ...resolved(api.fetch),
      model: { ...model, input: ["text", "image"] },
    }),
  });
  const invalid = {
    requestId: "generation-image-3",
    databaseName: "validation.db",
    model: { providerId: "validation", modelId: model.id },
    messages: [
      { role: "assistant", content: "旧回答", images: [{ data: png, mimeType: "image/png" }] },
      { role: "user", content: "继续" },
    ],
  } as unknown as AiGenerationRequest;
  const result = await (await runtime.generate(invalid)).result;
  expect(result.outcome).toBe("failed");
  expect(result.error?.message).toMatch(/用户|助手|assistant/i);
  expect(api.requests).toHaveLength(0);
});

it("只有图片没有文字的用户输入也能发送，不要求额外占位正文", async () => {
  const store = memoryStore();
  const api = network([{ text: "图片已收到。" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => ({
      ...resolved(api.fetch),
      model: { ...model, input: ["text", "image"] },
    }),
  });
  const result = await (
    await runtime.start(
      request(store.read().revision, {
        message: [{ type: "image", image: dataUrl }],
      })
    )
  ).result;
  expect(result.outcome).toBe("completed");
  const messages = api.requests[0].messages as Array<{ role: string; content: unknown }>;
  expect(messages.find(message => message.role === "user")?.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "image_url",
        image_url: expect.objectContaining({ url: dataUrl }),
      }),
    ])
  );
});

it("原问题含图时改用文本模型重试会在发送前拒绝，保留原问题和版本", async () => {
  const store = memoryStore();
  let allowImages = true;
  let requests = 0;
  const fetch: typeof globalThis.fetch = async () => {
    requests++;
    return new Response(JSON.stringify({ error: { message: "验证凭据无效" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  };
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => ({
      ...resolved(fetch),
      model: { ...model, input: allowImages ? ["text", "image"] : ["text"] },
    }),
  });
  const input = request(store.read().revision, {
    message: [
      { type: "text", text: "描述图片" },
      { type: "image", image: dataUrl },
    ],
  });
  const first = await (await runtime.start(input)).result;
  expect(first.outcome).toBe("failed");
  const saved = store.read();
  const user = saved.document.entries.find(entry => entry.message?.role === "user");
  if (!user) throw new Error("原问题未保存");
  allowImages = false;
  const failure = await runtime
    .retryLast({
      runId: "validation-image-retry-1",
      session: input.session,
      expectedRevision: saved.revision,
      model: input.model,
      toolIds: [],
      skillIds: [],
      interactionMode: "none",
      entryId: user.id,
    })
    .then(
      async handle => {
        await handle.result;
        return null;
      },
      error => error
    );
  expect(failure).toMatchObject({ name: "AiError" });
  expect(failure.message).toMatch(/图片|图像|image/i);
  expect(requests).toBe(1);
  expect(store.read().revision).toBe(saved.revision);
  expect(
    store.read().document.entries.filter(entry => entry.message?.role === "user")
  ).toHaveLength(1);
});
