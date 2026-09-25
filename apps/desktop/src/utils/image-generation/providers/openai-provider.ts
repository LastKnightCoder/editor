import type {
  IImageGenerationProvider,
  ImageProviderConfig,
  ImageResult,
  ImageGenerateParams,
  ImageEditParams,
} from "@/types/imageGeneration";
import { nodeFetch } from "@/commands/extra";
import {
  bananaLog,
  buildOpenAIImageRequest,
  parseImageHttpResponse,
  parseOpenAIImageResponse,
} from "@/utils/image-generation/shared";

interface NodeFetchRawResponse {
  data?: unknown;
  status?: number;
  statusText?: string;
  headers?: Record<string, string | string[] | undefined>;
}

const IMAGE_REQUEST_TIMEOUT_MS = 300_000;

const toResponseBody = (data: unknown): BodyInit => {
  if (data instanceof Uint8Array) {
    // IPC 数据必为 ArrayBuffer 背景，收窄以满足 BodyInit
    return data as Uint8Array<ArrayBuffer>;
  }
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (Array.isArray(data)) {
    return new Uint8Array(data);
  }
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return new Uint8Array((data as { data: number[] }).data);
  }
  if (typeof data === "string") {
    return data;
  }
  return JSON.stringify(data ?? "");
};

const normalizeHeaders = (headers: NodeFetchRawResponse["headers"] = {}): Headers => {
  const normalized = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      normalized.set(key, value.join(", "));
      return;
    }
    if (typeof value === "string") {
      normalized.set(key, value);
    }
  });
  return normalized;
};

const createResponseFromNodeFetch = (raw: NodeFetchRawResponse): Response =>
  new Response(toResponseBody(raw.data), {
    status: raw.status ?? 200,
    statusText: raw.statusText ?? "",
    headers: normalizeHeaders(raw.headers),
  });

const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const fileToMultipartPayload = async (file: File, index: number) => ({
  fieldName: "image[]",
  fileName: file.name || `image-${index + 1}.png`,
  mimeType: file.type || "application/octet-stream",
  base64: arrayBufferToBase64(await file.arrayBuffer()),
});

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

    const rawResponse = (await nodeFetch(request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      data: JSON.stringify(request.body),
      responseType: "arraybuffer",
      isRaw: true,
      allowHttpErrorStatus: true,
      timeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
      signal,
    })) as NodeFetchRawResponse;
    const response = createResponseFromNodeFetch(rawResponse);

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

    const rawResponse = (await nodeFetch(request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      multipart: {
        fields: Object.fromEntries(
          Object.entries(request.body).map(([key, value]) => [key, String(value)])
        ),
        files: await Promise.all(imageFiles.map(fileToMultipartPayload)),
      },
      responseType: "arraybuffer",
      isRaw: true,
      allowHttpErrorStatus: true,
      timeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
      signal,
    })) as NodeFetchRawResponse;
    const response = createResponseFromNodeFetch(rawResponse);

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
