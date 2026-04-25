import { describe, expect, it, vi } from "vitest";
import {
  buildOpenAIImageRequest,
  isImageGenerationConfigValid,
  normalizeOpenAIImageBaseUrl,
  resolveImageInputFile,
} from "../openai-image-service";

describe("openai-image-service", () => {
  it("仅在启用且连接参数完整时认为图片生成配置有效", () => {
    expect(
      isImageGenerationConfigValid({
        enabled: true,
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        modelName: "gpt-image-2",
      }),
    ).toBe(true);

    expect(
      isImageGenerationConfigValid({
        enabled: false,
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        modelName: "gpt-image-2",
      }),
    ).toBe(false);

    expect(
      isImageGenerationConfigValid({
        enabled: true,
        baseUrl: " ",
        apiKey: "sk-test",
        modelName: "gpt-image-2",
      }),
    ).toBe(false);
  });

  it("规范化 baseUrl 并拼接图片 API 地址", () => {
    expect(normalizeOpenAIImageBaseUrl("https://api.openai.com/v1/")).toBe(
      "https://api.openai.com/v1",
    );
    expect(
      buildOpenAIImageRequest({
        baseUrl: "https://api.openai.com/v1/",
        endpoint: "generations",
      }).url,
    ).toBe("https://api.openai.com/v1/images/generations");
  });

  it("只发送模型实际传入的可选图片参数", () => {
    const request = buildOpenAIImageRequest({
      baseUrl: "https://api.openai.com/v1",
      endpoint: "generations",
      model: "gpt-image-2",
      prompt: "生成一张方形头像",
      options: {
        size: "1024x1024",
        quality: undefined,
        output_format: "png",
      },
    });

    expect(request.body).toEqual({
      model: "gpt-image-2",
      prompt: "生成一张方形头像",
      size: "1024x1024",
      output_format: "png",
    });
    expect(request.body).not.toHaveProperty("quality");
  });

  it("将 data URL 图片转换为编辑 API 可用文件", async () => {
    const file = await resolveImageInputFile("data:image/png;base64,AQID", {
      fetchBinary: vi.fn(),
      readBinaryFile: vi.fn(),
      resolveLocalMediaPath: vi.fn(),
      getFileExtension: vi.fn(),
    });

    expect(file.name).toMatch(/input-image-\d+\.png/);
    expect(file.type).toBe("image/png");
    expect(await file.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
  });
});
