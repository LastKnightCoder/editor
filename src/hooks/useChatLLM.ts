import { RequestMessage, KnowledgeOptions, MessageContent } from "@/types";
import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import {
  chat,
  stream,
  getResourceById,
  readBinaryFile,
  getHomeDir,
} from "@/commands";
import { performRAGEnhancement } from "@/utils/rag-helper";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import { remoteResourceToLocal } from "@/utils";

interface IChatStreamOptions {
  onFinish?: (
    content: string,
    reasoning_content: string,
    res: Response,
  ) => void;
  onUpdate?: (
    responseText: string,
    fetchText: string,
    reasoningText?: string,
  ) => void;
  onReasoning?: (responseText: string, fetchText: string) => void;
  onError?: (e: Error) => void;
  onController?: (controller: AbortController) => void;
  enableThinking?: boolean;
}

const FILE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  jfif: "image/jpeg",
  ico: "image/x-icon",
};

const guessMimeTypeFromPath = (path: string) => {
  if (!path) {
    return "application/octet-stream";
  }
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(path);
  if (match) {
    const ext = match[1].toLowerCase();
    return FILE_MIME_TYPES[ext] || "application/octet-stream";
  }
  return "application/octet-stream";
};

const readBlobAsDataURL = (blob: Blob) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const binaryToDataURL = async (binary: BlobPart, mimeType: string) => {
  const blob = new Blob([binary], { type: mimeType });
  return await readBlobAsDataURL(blob);
};

const fetchUrlAsBase64 = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`获取资源失败: ${response.status}`);
  }
  const blob = await response.blob();
  return await readBlobAsDataURL(blob);
};

const tryConvertUrlToBase64 = async (url?: string | null) => {
  if (!url) {
    return null;
  }
  if (url.startsWith("data:")) {
    return url;
  }
  try {
    return await fetchUrlAsBase64(url);
  } catch (error) {
    console.error("转换图片为 Base64 失败:", error);
    return url;
  }
};

const resolveResourceAbsolutePath = async (resourcePath: string) => {
  if (!resourcePath) {
    return null;
  }

  if (/^https?:/i.test(resourcePath)) {
    try {
      return await remoteResourceToLocal(resourcePath);
    } catch (error) {
      console.error("下载远程资源失败:", error);
      return null;
    }
  }

  if (resourcePath.startsWith("~")) {
    const homeDir = await getHomeDir();
    return `${homeDir}${resourcePath.slice(1)}`;
  }

  return resourcePath;
};

const buildResourceDataUrl = async (
  resourceId?: number,
  fallbackPath?: string,
  fallbackName?: string,
): Promise<string | null> => {
  const convertFromPath = async (
    path: string,
    nameHint?: string,
    forcedMime?: string,
  ) => {
    try {
      const absolutePath = await resolveResourceAbsolutePath(path);
      if (absolutePath) {
        const binary = await readBinaryFile(absolutePath);
        let mimeType =
          forcedMime ||
          guessMimeTypeFromPath(path) ||
          "application/octet-stream";
        if (mimeType === "application/octet-stream" && nameHint) {
          const guessedFromName = guessMimeTypeFromPath(nameHint);
          if (
            guessedFromName &&
            guessedFromName !== "application/octet-stream"
          ) {
            mimeType = guessedFromName;
          }
        }
        return await binaryToDataURL(binary as BlobPart, mimeType);
      }
      return await tryConvertUrlToBase64(path);
    } catch (error) {
      console.error("读取资源失败:", error);
      return await tryConvertUrlToBase64(path);
    }
  };

  if (resourceId) {
    try {
      const resource = await getResourceById(resourceId);
      if (resource) {
        const forcedMime =
          resource.type === "pdf" ? "application/pdf" : undefined;
        const result = await convertFromPath(
          resource.path,
          resource.name,
          forcedMime,
        );
        if (result) {
          return result;
        }
      }
    } catch (error) {
      console.error("获取资源失败:", error);
    }
  }

  if (fallbackPath) {
    const fallbackMime =
      fallbackName && fallbackName.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : undefined;
    return await convertFromPath(fallbackPath, fallbackName, fallbackMime);
  }

  return null;
};

const buildImageBase64 = async (
  resourceId?: number,
  fallbackUrl?: string,
): Promise<string | null> => {
  return await buildResourceDataUrl(resourceId, fallbackUrl);
};

const buildFileBase64 = async (
  resourceId?: number,
  fallbackPath?: string,
  fallbackName?: string,
): Promise<string | null> => {
  return await buildResourceDataUrl(resourceId, fallbackPath, fallbackName);
};

const normalizeMessageContent = async (
  message: RequestMessage,
): Promise<RequestMessage> => {
  if (!Array.isArray(message.content)) {
    return message;
  }

  const normalized: MessageContent[] = [];
  for (const item of message.content) {
    if (item.type === "image") {
      const imageData = await buildImageBase64(item.resourceId, item.image);
      normalized.push(
        imageData
          ? {
              ...item,
              image: imageData,
            }
          : item,
      );
    } else if (item.type === "file") {
      const fileData = await buildFileBase64(
        item.resourceId,
        item.file,
        item.fileName,
      );
      normalized.push(
        fileData
          ? {
              ...item,
              file: fileData,
            }
          : item,
      );
    } else {
      normalized.push(item);
    }
  }

  return {
    ...message,
    content: normalized,
  };
};

const normalizeMessages = async (
  messages: RequestMessage[],
): Promise<RequestMessage[]> => {
  const normalized: RequestMessage[] = [];
  for (const message of messages) {
    normalized.push(await normalizeMessageContent(message));
  }
  return normalized;
};

const chatInner = async (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  knowledgeOptions?: KnowledgeOptions,
  options?: {
    enableThinking?: boolean;
  },
) => {
  if (!providerConfig) {
    message.error("未提供大模型配置");
    return null;
  }

  if (!modelConfig) {
    message.error("未提供具体模型配置");
    return null;
  }

  const { apiKey, baseUrl } = providerConfig;
  const { name: modelName } = modelConfig;

  let finalMessages = [...messages];

  // 如果启用了知识库功能，进行 RAG 处理
  if (knowledgeOptions?.enable && messages.length > 0) {
    try {
      finalMessages = await performRAGEnhancement(messages, knowledgeOptions);
    } catch (error) {
      console.error("RAG 搜索失败:", error);
      // 如果搜索失败，继续正常的聊天流程
    }
  }

  const preparedMessages = await normalizeMessages(finalMessages);

  // 使用普通聊天，传入处理后的消息
  return await chat(apiKey, baseUrl, modelName, preparedMessages, options);
};

export const chatStreamInner = async (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  options: IChatStreamOptions,
  knowledgeOptions?: KnowledgeOptions,
) => {
  if (!providerConfig) {
    options.onError?.(new Error("无法获取到当前 LLM 配置"));
    return;
  }

  if (!modelConfig) {
    options.onError?.(new Error("无法获取到当前模型配置"));
    return;
  }

  const { apiKey, baseUrl } = providerConfig;
  const { name: modelName } = modelConfig;
  const chatPath = `${baseUrl}${baseUrl.endsWith("/") ? "" : "/"}chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  let finalMessages = [...messages];

  // 如果启用了知识库功能，进行 RAG 处理
  if (knowledgeOptions?.enable && messages.length > 0) {
    try {
      finalMessages = await performRAGEnhancement(messages, knowledgeOptions);
    } catch (error) {
      console.error("RAG 搜索失败:", error);
      // 如果搜索失败，继续正常的流式请求
    }
  }

  // 转换消息格式用于流式请求
  const preparedMessages = await normalizeMessages(finalMessages);

  const streamMessages = preparedMessages.map((msg) => {
    if (typeof msg.content === "string") {
      return {
        role: msg.role,
        content: msg.content,
      };
    }

    // 只有一个文本内容时使用简单格式
    if (msg.content?.length === 1 && msg.content[0].type === "text") {
      return {
        role: msg.role,
        content: msg.content[0].text,
      };
    }

    // 多模态内容格式
    return {
      role: msg.role,
      content: msg.content
        .map((item) => {
          if (item.type === "text") {
            return {
              type: "text",
              text: item.text,
            };
          } else if (item.type === "image") {
            return {
              type: "image_url",
              image_url: {
                url: item.image,
              },
            };
          } else if (item.type === "file") {
            if (!item.file?.startsWith("data:application/pdf")) {
              console.warn(
                "附件缺少 PDF data URL，已跳过发送",
                item.fileName ?? "",
              );
              return null;
            }
            return {
              type: "file",
              file: {
                filename: item.fileName || "file",
                file_data: item.file,
              },
            };
          }
        })
        .filter((item): item is Exclude<typeof item, null> => Boolean(item)),
    };
  });

  const notSupportTemperature = ["o1", "o3", "o4", "gpt-5"].some((model) =>
    modelName.startsWith(model),
  );
  const notSupportFrequencyPenalty = ["gemini"].some((model) =>
    modelName.startsWith(model),
  );

  const requestPayload = {
    messages: streamMessages,
    stream: true,
    model: modelName,
    temperature: notSupportTemperature ? undefined : 0.3,
    presence_penalty: 0,
    frequency_penalty: notSupportFrequencyPenalty ? undefined : 0,
    top_p: 1,
    reasoning_effort: options.enableThinking ? "medium" : undefined,
  };
  console.log("Chat request payload:", requestPayload);

  const controller = new AbortController();
  options.onController?.(controller);
  stream(
    chatPath,
    requestPayload,
    headers,
    controller,
    (text: string) => {
      const json = JSON.parse(text);
      const choices = json.choices as Array<{
        delta: {
          content: string;
          reasoning_content: string;
        };
      }>;
      return choices[0]?.delta;
    },
    options,
  );
};

const useChatLLM = () => {
  const chatLLM = useMemoizedFn(
    async (
      providerConfig: ProviderConfig,
      modelConfig: ModelConfig,
      messages: RequestMessage[],
      knowledgeOptions?: KnowledgeOptions,
    ) => {
      return await chatInner(
        providerConfig,
        modelConfig,
        messages,
        knowledgeOptions,
      );
    },
  );

  const chatLLMStream = useMemoizedFn(
    (
      providerConfig: ProviderConfig,
      modelConfig: ModelConfig,
      messages: RequestMessage[],
      options: IChatStreamOptions,
      knowledgeOptions?: KnowledgeOptions,
    ) => {
      return chatStreamInner(
        providerConfig,
        modelConfig,
        messages,
        options,
        knowledgeOptions,
      );
    },
  );

  return {
    chatLLM,
    chatLLMStream,
  };
};

export const chatLLM = async (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  knowledgeOptions?: KnowledgeOptions,
) => {
  return await chatInner(
    providerConfig,
    modelConfig,
    messages,
    knowledgeOptions,
  );
};

export const chatLLMStream = (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  options: IChatStreamOptions,
  knowledgeOptions?: KnowledgeOptions,
) => {
  chatStreamInner(
    providerConfig,
    modelConfig,
    messages,
    options,
    knowledgeOptions,
  );
};

export default useChatLLM;
