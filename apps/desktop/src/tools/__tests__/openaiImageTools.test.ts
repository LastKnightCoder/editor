import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockProvider } = vi.hoisted(() => ({
  mockProvider: {
    generate: vi.fn(),
    edit: vi.fn(),
  },
}));

vi.mock("@/utils/image-generation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/utils/image-generation")>();
  return {
    ...actual,
    createProviderFromConfig: vi.fn(() => mockProvider),
  };
});

import {
  createImageToolDefinitions,
  getImageToolsEnabled,
} from "../openaiImageTools";

// 辅助：构建一个有效的 ProviderConfig
const mockProviderConfig = (overrides = {}) => ({
  id: "test",
  name: "test",
  providerType: "openai" as const,
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  modelName: "gpt-image-2",
  ...overrides,
});

const mockStoreState = (overrides = {}) => ({
  currentProviderId: "default",
  providers: [
    {
      id: "default",
      name: "test",
      providerType: "openai" as const,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      modelName: "gpt-image-2",
      ...overrides,
    },
  ],
});

describe("openaiImageTools", () => {
  beforeEach(() => {
    mockProvider.generate.mockReset();
    mockProvider.edit.mockReset();
  });

  it("仅在图片生成配置有效时启用工具", () => {
    expect(getImageToolsEnabled(mockStoreState())).toBe(true);

    expect(getImageToolsEnabled(mockStoreState({ apiKey: "" }))).toBe(false);
  });

  it("暴露生成和编辑两个工具，并将图片参数作为可选参数", () => {
    const tools = createImageToolDefinitions({
      getConfig: () => mockProviderConfig(),
      uploadImage: vi.fn(),
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "generate_image",
      "edit_image",
    ]);
    expect(tools[0].parameters.required).toEqual(["prompt"]);
    expect(tools[0].parameters.properties).toHaveProperty("size");
    expect(tools[0].parameters.properties).toHaveProperty("quality");
    expect(tools[0].parameters.properties).toHaveProperty("output_format");
    expect(tools[0].parameters.properties).toHaveProperty("background");
    expect(tools[0].parameters.properties).toHaveProperty("n");
    expect(tools[1].parameters.required).toEqual(["prompt", "image_paths"]);
  });

  it("生成工具上传 b64 图片并返回渲染 metadata", async () => {
    mockProvider.generate.mockResolvedValue([
      { b64Json: "iVBORw0KGgo=", mimeType: "image/png" },
    ]);
    const uploadImage = vi.fn().mockResolvedValue("https://cdn.test/image.png");
    const [generateTool] = createImageToolDefinitions({
      getConfig: () => mockProviderConfig(),
      uploadImage,
    });

    const result = await generateTool.executor({
      prompt: "生成透明背景 logo",
      background: "transparent",
    });

    expect(mockProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "生成透明背景 logo",
        options: { background: "transparent" },
      }),
    );
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(typeof result).toBe("object");
    expect((result as any).metadata.render.rendererKey).toBe(
      "openai-image-result",
    );
    expect(JSON.parse((result as any).content).images[0].url).toBe(
      "https://cdn.test/image.png",
    );
  });

  it("生成工具遇到远程 url 结果时先下载再自定义上传", async () => {
    mockProvider.generate.mockResolvedValue([
      {
        url: "https://temp.test/generated.png",
      },
    ]);
    const resolvedFile = new File([new Uint8Array([1, 2, 3])], "remote.png", {
      type: "image/png",
    });
    const resolveImageInputFile = vi.fn().mockResolvedValue(resolvedFile);
    const uploadImage = vi.fn().mockResolvedValue("https://cdn.test/final.png");
    const [generateTool] = createImageToolDefinitions({
      getConfig: () => mockProviderConfig(),
      uploadImage,
      resolveImageInputFile,
    });

    const result = await generateTool.executor({ prompt: "生成一张图" });

    expect(resolveImageInputFile).toHaveBeenCalledWith(
      "https://temp.test/generated.png",
    );
    expect(uploadImage).toHaveBeenCalledWith(resolvedFile);
    expect(JSON.parse((result as any).content).images[0].url).toBe(
      "https://cdn.test/final.png",
    );
  });
});
