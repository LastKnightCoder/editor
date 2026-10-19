import { beforeEach, expect, it, vi } from "vitest";
import { createImageToolDefinitions, getImageToolsEnabled } from "../openaiImageTools";
import { useImageCapabilities } from "@/services/image-capabilities";

const config = {
  id: "account",
  name: "图片",
  pluginId: "test.images",
  modelId: "model",
  config: { region: "a" },
};
beforeEach(() => useImageCapabilities.setState({ canGenerate: true, canEdit: true }));

it("工具可用性同时依赖账号选择和插件能力", () => {
  const state = { currentProviderId: "account", providers: [config] };
  expect(getImageToolsEnabled(state)).toBe(true);
  useImageCapabilities.setState({ canGenerate: false, canEdit: false });
  expect(getImageToolsEnabled(state)).toBe(false);
  expect(getImageToolsEnabled({ ...state, currentProviderId: "deleted" })).toBe(false);
});

it("生成和编辑共用图片服务，转换选项并保留历史结果键", async () => {
  const generate = vi.fn(async () => [
    { url: "https://cdn.test/image.webp", mimeType: "image/webp", fileName: "image.webp" },
  ]);
  const tools = createImageToolDefinitions({ getConfig: () => config, generate });
  expect(tools.map(tool => tool.name)).toEqual(["generate_image", "edit_image"]);
  const controller = new AbortController();
  const result = await tools[0].executor(
    { prompt: "生成", n: 2, output_format: "webp" },
    {
      signal: controller.signal,
      toolCallId: "image",
      toolName: "generate_image",
      source: "openai-image-tools",
    }
  );
  expect(generate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      config,
      prompt: "生成",
      options: expect.objectContaining({ count: 2, outputFormat: "webp" }),
      signal: controller.signal,
    })
  );
  expect(result).toMatchObject({ metadata: { render: { rendererKey: "openai-image-result" } } });
  await tools[1].executor({ prompt: "编辑", image_paths: ["/tmp/a.png"] });
  expect(generate).toHaveBeenLastCalledWith(
    expect.objectContaining({ imagePaths: ["/tmp/a.png"], prompt: "编辑" })
  );
});

it("没有当前账号时不调用图片服务", async () => {
  const generate = vi.fn();
  const [tool] = createImageToolDefinitions({ getConfig: () => null, generate });
  expect(await tool.executor({ prompt: "生成" })).toMatchObject({ isParameterError: true });
  expect(generate).not.toHaveBeenCalled();
});
