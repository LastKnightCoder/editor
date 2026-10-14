import type {
  IImageGenerationProvider,
  ImageProviderConfig,
  ImageResult,
  ImageGenerateParams,
  ImageEditParams,
} from "@/types/imageGeneration";
import { desktopFetch } from "@/commands/fetch";
import {
  bananaLog,
  buildOpenAIImageRequest,
  parseImageHttpResponse,
  parseOpenAIImageResponse,
} from "@/utils/image-generation/shared";

const IMAGE_REQUEST_TIMEOUT_MS = 300_000;

/**
 * OpenAI 兼容 API 的图片生成提供商实现
 */
export class OpenAIImageProvider implements IImageGenerationProvider {
  readonly type = "openai" as const;

  async generate(params: ImageGenerateParams): Promise<ImageResult[]> {
    const { config, prompt, options, signal } = params;
    assertValidConfig(config);

    const request = buildOpenAIImageRequest({
      baseUrl: config.baseUrl,
      endpoint: "generations",
      model: config.modelName,
      prompt,
      options: options as any,
    });

    bananaLog("openai-image.generate.request", {
      url: request.url,
      model: request.body.model,
      optionKeys: Object.keys(options ?? {}),
      body: request.body,
      apiKeyConfigured: Boolean(config.apiKey?.trim()),
    });

    const response = await desktopFetch(request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
    });

    const { payload, rawText, binaryResult } = await parseImageHttpResponse(response);

    bananaLog("openai-image.generate.response", {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText,
      contentType: response.headers.get("content-type"),
      payloadType: typeof payload,
      topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload) : null,
      rawTextLength: rawText?.length ?? null,
      hasBinaryResult: Boolean(binaryResult),
      errorMessage: (payload as any)?.error?.message ?? null,
    });

    if (!response.ok) {
      throw new Error(
        (payload as any)?.error?.message ||
          rawText?.slice(0, 500) ||
          `图片生成失败: ${response.status}`
      );
    }

    if (binaryResult) {
      return [binaryResult];
    }

    return parseOpenAIImageResponse(payload);
  }

  async edit(params: ImageEditParams): Promise<ImageResult[]> {
    const { config, prompt, imageFiles, options, signal } = params;
    assertValidConfig(config);

    if (imageFiles.length === 0) {
      throw new Error("图片编辑至少需要一张输入图片");
    }

    const request = buildOpenAIImageRequest({
      baseUrl: config.baseUrl,
      endpoint: "edits",
      model: config.modelName,
      prompt,
      options: options as any,
    });

    bananaLog("openai-image.edit.request", {
      url: request.url,
      model: request.body.model,
      optionKeys: Object.keys(options ?? {}),
      body: request.body,
      imageFiles: imageFiles.map(file => ({
        name: file.name,
        type: file.type,
        size: file.size,
      })),
      apiKeyConfigured: Boolean(config.apiKey?.trim()),
    });

    const body = new FormData();
    Object.entries(request.body).forEach(([key, value]) => body.append(key, String(value)));
    imageFiles.forEach((file, index) =>
      body.append("image[]", file, file.name || `image-${index + 1}.png`)
    );
    const response = await desktopFetch(request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
    });

    const { payload, rawText, binaryResult } = await parseImageHttpResponse(response);

    bananaLog("openai-image.edit.response", {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText,
      contentType: response.headers.get("content-type"),
      payloadType: typeof payload,
      topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload) : null,
      rawTextLength: rawText?.length ?? null,
      hasBinaryResult: Boolean(binaryResult),
      errorMessage: (payload as any)?.error?.message ?? null,
    });

    if (!response.ok) {
      throw new Error(
        (payload as any)?.error?.message ||
          rawText?.slice(0, 500) ||
          `图片编辑失败: ${response.status}`
      );
    }

    if (binaryResult) {
      return [binaryResult];
    }

    return parseOpenAIImageResponse(payload);
  }
}

function assertValidConfig(config: ImageProviderConfig) {
  if (!config.baseUrl?.trim() || !config.apiKey?.trim() || !config.modelName?.trim()) {
    throw new Error("图片生成配置无效，请先在设置中填写模型地址、API Key 和模型名称");
  }
}
