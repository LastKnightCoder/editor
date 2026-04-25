import { getFileExtension, readBinaryFile } from "@/commands/file";
import { nodeFetch } from "@/commands/extra";
import { resolveLocalMediaPath } from "./localMediaPath";

export const DEFAULT_OPENAI_IMAGE_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-2";

export interface ImageGenerationConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

export interface OpenAIImageOptions {
  size?: string;
  quality?: string;
  output_format?: string;
  background?: string;
  n?: number;
}

export interface OpenAIImageResult {
  b64Json?: string;
  url?: string;
  mimeType?: string;
  revisedPrompt?: string;
}

interface ParsedImageHttpResponse {
  payload: unknown;
  rawText: string | null;
  binaryResult: OpenAIImageResult | null;
}

export interface ResolvedImageInputFile extends File {
  resolvedPath?: string;
}

export interface ImageInputFileDependencies {
  fetchBinary?: (
    url: string,
  ) => Promise<{ data: Uint8Array; mimeType: string }>;
  readBinaryFile?: typeof readBinaryFile;
  resolveLocalMediaPath?: typeof resolveLocalMediaPath;
  getFileExtension?: typeof getFileExtension;
}

const IMAGE_OPTION_KEYS: Array<keyof OpenAIImageOptions> = [
  "size",
  "quality",
  "output_format",
  "background",
  "n",
];

const bananaLog = (event: string, payload: Record<string, unknown>) => {
  try {
    console.log(`🍌 ${event} ${JSON.stringify(payload)}`);
  } catch (error) {
    console.log(
      `🍌 ${event} ${JSON.stringify({ logError: (error as Error).message })}`,
    );
  }
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const isImageGenerationConfigValid = (
  config?: Partial<ImageGenerationConfig> | null,
) =>
  Boolean(
    config?.enabled &&
    config.baseUrl?.trim() &&
    config.apiKey?.trim() &&
    config.modelName?.trim(),
  );

export const normalizeOpenAIImageBaseUrl = (baseUrl: string) =>
  (baseUrl || DEFAULT_OPENAI_IMAGE_BASE_URL).trim().replace(/\/+$/, "");

const compactImageOptions = (options?: OpenAIImageOptions) => {
  const compacted: Record<string, string | number> = {};
  IMAGE_OPTION_KEYS.forEach((key) => {
    const value = options?.[key];
    if (value === undefined || value === null || value === "") {
      return;
    }
    compacted[key] = value;
  });
  return compacted;
};

export const buildOpenAIImageRequest = (params: {
  baseUrl: string;
  endpoint: "generations" | "edits";
  model?: string;
  prompt?: string;
  options?: OpenAIImageOptions;
}) => ({
  url: `${normalizeOpenAIImageBaseUrl(params.baseUrl)}/images/${params.endpoint}`,
  body: {
    ...(params.model ? { model: params.model } : {}),
    ...(params.prompt ? { prompt: params.prompt } : {}),
    ...compactImageOptions(params.options),
  },
});

const parseDataUrl = (value: string) => {
  const match = value.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i,
  );
  if (!match) {
    throw new Error("仅支持 png、jpeg、webp 格式的 data URL 图片");
  }
  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, mimeType };
};

const extensionFromMimeType = (mimeType: string) => EXTENSION_BY_MIME[mimeType];

const mimeTypeFromExtension = (extension: string) =>
  MIME_BY_EXTENSION[extension.toLowerCase().replace(/^\./, "")];

const createImageFile = (
  bytes: Uint8Array,
  mimeType: string,
  prefix = "input-image",
): ResolvedImageInputFile => {
  const extension = extensionFromMimeType(mimeType);
  if (!extension) {
    throw new Error("仅支持 png、jpeg、webp 格式的图片");
  }
  const file = new File([bytes], `${prefix}-${Date.now()}.${extension}`, {
    type: mimeType,
  });
  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => bytes.buffer.slice(0),
    });
  }
  return file;
};

const fetchRemoteImage = async (url: string) => {
  const response = (await nodeFetch(url, {
    method: "GET",
    responseType: "arraybuffer",
    isRaw: true,
  })) as { data?: ArrayBuffer | Uint8Array; headers?: Record<string, string> };
  const data = response.data ?? (response as unknown as ArrayBuffer);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const contentType =
    response.headers?.["content-type"] ||
    response.headers?.["Content-Type"] ||
    "";
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  if (!extensionFromMimeType(mimeType)) {
    throw new Error("远程图片格式不受支持，仅支持 png、jpeg、webp");
  }
  return { data: bytes, mimeType };
};

export const resolveImageInputFile = async (
  rawValue: string,
  dependencies: ImageInputFileDependencies = {},
): Promise<ResolvedImageInputFile> => {
  const value = rawValue.trim();
  if (!value) {
    throw new Error("图片路径不能为空");
  }

  if (value.startsWith("data:")) {
    const { bytes, mimeType } = parseDataUrl(value);
    return createImageFile(bytes, mimeType);
  }

  if (/^https?:\/\//i.test(value)) {
    const { data, mimeType } = await (
      dependencies.fetchBinary ?? fetchRemoteImage
    )(value);
    return createImageFile(data, mimeType);
  }

  const localPath = await (
    dependencies.resolveLocalMediaPath ?? resolveLocalMediaPath
  )(value);
  const extension = await (dependencies.getFileExtension ?? getFileExtension)(
    localPath,
  );
  const mimeType = mimeTypeFromExtension(extension);
  if (!mimeType) {
    throw new Error("本地图片格式不受支持，仅支持 png、jpeg、webp");
  }

  const bytes = await (dependencies.readBinaryFile ?? readBinaryFile)(
    localPath,
  );
  const file = createImageFile(bytes, mimeType);
  file.resolvedPath = localPath;
  return file;
};

const parseOpenAIImageResponse = (payload: unknown): OpenAIImageResult[] => {
  bananaLog("openai-image.parse-response", {
    payloadType: typeof payload,
    topLevelKeys:
      payload && typeof payload === "object" ? Object.keys(payload) : null,
    dataLength:
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as any).data)
        ? (payload as any).data.length
        : null,
    dataItemKeys:
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as any).data) &&
      (payload as any).data[0] &&
      typeof (payload as any).data[0] === "object"
        ? Object.keys((payload as any).data[0])
        : null,
    outputTypes:
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as any).data)
        ? (payload as any).data.map((item: unknown) =>
            item && typeof item === "object"
              ? {
                  keys: Object.keys(item),
                  hasB64Json: typeof (item as any).b64_json === "string",
                  hasUrl: typeof (item as any).url === "string",
                  type: (item as any).type,
                }
              : { itemType: typeof item },
          )
        : null,
  });
  const data =
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as any).data)
      ? ((payload as any).data as Array<Record<string, unknown>>)
      : [];
  const results: OpenAIImageResult[] = data
    .map((item): OpenAIImageResult | null => {
      const b64Json = item.b64_json;
      const url = item.url;
      if (
        (typeof b64Json !== "string" || !b64Json) &&
        (typeof url !== "string" || !url)
      ) {
        return null;
      }
      const outputFormat =
        typeof item.output_format === "string" ? item.output_format : "png";
      const result: OpenAIImageResult = {};
      if (typeof b64Json === "string" && b64Json) {
        result.b64Json = b64Json;
        result.mimeType = mimeTypeFromExtension(outputFormat) ?? "image/png";
      }
      if (typeof url === "string" && url) {
        result.url = url;
      }
      if (typeof item.revised_prompt === "string") {
        result.revisedPrompt = item.revised_prompt;
      }
      return result;
    })
    .filter((item): item is OpenAIImageResult => Boolean(item));

  if (results.length === 0) {
    throw new Error(
      "OpenAI 图片接口未返回 b64_json 或 url 图片数据，请复制 🍌 日志排查响应结构",
    );
  }
  return results;
};

const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const parseImageHttpResponse = async (
  response: Response,
): Promise<ParsedImageHttpResponse> => {
  const contentType = response.headers.get("content-type") || "";
  const normalizedContentType = contentType.split(";")[0].trim().toLowerCase();
  if (normalizedContentType.startsWith("image/")) {
    const arrayBuffer = await response.arrayBuffer();
    bananaLog("openai-image.binary-response", {
      contentType,
      byteLength: arrayBuffer.byteLength,
    });
    return {
      payload: null,
      rawText: null,
      binaryResult: {
        b64Json: arrayBufferToBase64(arrayBuffer),
        mimeType: normalizedContentType,
      },
    };
  }

  const rawText = await response.text();
  bananaLog("openai-image.raw-response", {
    contentType,
    textLength: rawText.length,
    textPreview: rawText.slice(0, 500),
  });

  if (!rawText.trim()) {
    return { payload: null, rawText, binaryResult: null };
  }

  try {
    return { payload: JSON.parse(rawText), rawText, binaryResult: null };
  } catch (error) {
    bananaLog("openai-image.json-parse-failed", {
      message: (error as Error).message,
      contentType,
      textPreview: rawText.slice(0, 500),
    });
    return { payload: null, rawText, binaryResult: null };
  }
};

const assertValidConfig = (config: ImageGenerationConfig) => {
  if (!isImageGenerationConfigValid(config)) {
    throw new Error(
      "图片生成配置无效，请在设置中启用并填写模型地址、API Key 和模型名称",
    );
  }
};

export const generateOpenAIImages = async (params: {
  config: ImageGenerationConfig;
  prompt: string;
  options?: OpenAIImageOptions;
  signal?: AbortSignal;
}): Promise<OpenAIImageResult[]> => {
  assertValidConfig(params.config);
  const request = buildOpenAIImageRequest({
    baseUrl: params.config.baseUrl,
    endpoint: "generations",
    model: params.config.modelName,
    prompt: params.prompt,
    options: params.options,
  });
  bananaLog("openai-image.generate.request", {
    url: request.url,
    model: request.body.model,
    optionKeys: Object.keys(params.options ?? {}),
    body: request.body,
    apiKeyConfigured: Boolean(params.config.apiKey?.trim()),
  });
  const response = await fetch(request.url, {
    method: "POST",
    signal: params.signal,
    headers: {
      Authorization: `Bearer ${params.config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request.body),
  });
  const { payload, rawText, binaryResult } =
    await parseImageHttpResponse(response);
  bananaLog("openai-image.generate.response", {
    status: response.status,
    ok: response.ok,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    payloadType: typeof payload,
    topLevelKeys:
      payload && typeof payload === "object" ? Object.keys(payload) : null,
    rawTextLength: rawText?.length ?? null,
    hasBinaryResult: Boolean(binaryResult),
    errorMessage: (payload as any)?.error?.message ?? null,
  });
  if (!response.ok) {
    throw new Error(
      (payload as any)?.error?.message ||
        rawText?.slice(0, 500) ||
        `OpenAI 图片生成失败: ${response.status}`,
    );
  }
  if (binaryResult) {
    return [binaryResult];
  }
  return parseOpenAIImageResponse(payload);
};

export const editOpenAIImages = async (params: {
  config: ImageGenerationConfig;
  prompt: string;
  imageFiles: File[];
  options?: OpenAIImageOptions;
  signal?: AbortSignal;
}): Promise<OpenAIImageResult[]> => {
  assertValidConfig(params.config);
  if (params.imageFiles.length === 0) {
    throw new Error("图片编辑至少需要一张输入图片");
  }
  const request = buildOpenAIImageRequest({
    baseUrl: params.config.baseUrl,
    endpoint: "edits",
    model: params.config.modelName,
    prompt: params.prompt,
    options: params.options,
  });
  bananaLog("openai-image.edit.request", {
    url: request.url,
    model: request.body.model,
    optionKeys: Object.keys(params.options ?? {}),
    body: request.body,
    imageFiles: params.imageFiles.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })),
    apiKeyConfigured: Boolean(params.config.apiKey?.trim()),
  });
  const formData = new FormData();
  Object.entries(request.body).forEach(([key, value]) => {
    formData.append(key, String(value));
  });
  params.imageFiles.forEach((file) => formData.append("image[]", file));

  const response = await fetch(request.url, {
    method: "POST",
    signal: params.signal,
    headers: {
      Authorization: `Bearer ${params.config.apiKey}`,
    },
    body: formData,
  });
  const { payload, rawText, binaryResult } =
    await parseImageHttpResponse(response);
  bananaLog("openai-image.edit.response", {
    status: response.status,
    ok: response.ok,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    payloadType: typeof payload,
    topLevelKeys:
      payload && typeof payload === "object" ? Object.keys(payload) : null,
    rawTextLength: rawText?.length ?? null,
    hasBinaryResult: Boolean(binaryResult),
    errorMessage: (payload as any)?.error?.message ?? null,
  });
  if (!response.ok) {
    throw new Error(
      (payload as any)?.error?.message ||
        rawText?.slice(0, 500) ||
        `OpenAI 图片编辑失败: ${response.status}`,
    );
  }
  if (binaryResult) {
    return [binaryResult];
  }
  return parseOpenAIImageResponse(payload);
};

export const createImageFileFromBase64 = (
  b64Json: string,
  mimeType = "image/png",
  prefix = "openai-image",
) => {
  const binary = atob(b64Json);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return createImageFile(bytes, mimeType, prefix);
};
