import { beforeEach, expect, it, vi } from "vitest";
import type { AiToolExecutionContext } from "@tau/ai/contracts";
import { Role, type ChatSessionMessage } from "@tau/shared/chat-core";
import { createMobileImageTools, latestUserImages } from "../imageTools";

const context = (): AiToolExecutionContext => ({
  session: { databaseName: "data.db", sessionId: "s" },
  signal: new AbortController().signal,
  runId: "r",
  executionId: "e",
  toolCallId: "t",
  operationId: "o",
});
const generate = vi.fn(async () => [
  { url: "/resources/result.png", fileName: "result.png", mimeType: "image/png" },
]);
const readImages = vi.fn(async () => ["data:image/png;base64,AQID", "https://images.test/b.png"]);
const tools = () => createMobileImageTools("data.db", { generate, readImages });
beforeEach(() => {
  vi.clearAllMocks();
});

it("生成映射单次参数，结果只包含资源地址与公共载荷", async () => {
  const result = await tools()[0].execute(
    { prompt: " 一只猫 ", n: 2, output_format: "webp" },
    context()
  );
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({
      database: "data.db",
      prompt: "一只猫",
      options: expect.objectContaining({ count: 2, outputFormat: "webp" }),
    })
  );
  expect(JSON.parse(result.content)).toMatchObject({
    success: true,
    mode: "generate",
    images: [{ url: "/resources/result.png" }],
  });
  expect(result.metadata).toMatchObject({ render: { rendererKey: "openai-image-result" } });
});

it("编辑缺省取当前附件，编号从 1 开始；指定地址时不读取附件", async () => {
  await tools()[1].execute({ prompt: "换背景", image_indices: [2] }, context());
  expect(generate).toHaveBeenLastCalledWith(
    expect.objectContaining({ imagePaths: ["https://images.test/b.png"] })
  );
  await tools()[1].execute({ prompt: "再修改", image_paths: ["/resources/result.png"] }, context());
  expect(generate).toHaveBeenLastCalledWith(
    expect.objectContaining({ imagePaths: ["/resources/result.png"] })
  );
  expect(readImages).toHaveBeenCalledTimes(1);
});

it("当前消息没有附件时不会误取更早用户图片", () => {
  const messages = [
    { role: Role.User, content: [{ type: "image", image: "old" }] },
    { role: Role.Assistant, content: "收到" },
    { role: Role.User, content: "帮我编辑" },
  ] as ChatSessionMessage[];
  expect(latestUserImages(messages)).toEqual([]);
  expect(latestUserImages(messages.slice(0, 2))).toEqual(["old"]);
});

it("空编辑输入、错误编号、无效数量和跨库调用不触发提供方", async () => {
  for (const input of [
    { prompt: "" },
    { prompt: "修改", image_paths: [] },
    { prompt: "修改", image_indices: [0] },
    { prompt: "修改", image_paths: ["x"], image_indices: [1] },
    { prompt: "修改", n: 1.5 },
  ]) {
    const result = await tools()[1].execute(input, context());
    expect(JSON.parse(result.content).success).toBe(false);
  }
  const wrong = context();
  wrong.session.databaseName = "other.db";
  expect(JSON.parse((await tools()[0].execute({ prompt: "生成" }, wrong)).content).success).toBe(
    false
  );
  expect(generate).not.toHaveBeenCalled();
});
