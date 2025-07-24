import { RequestMessage, KnowledgeOptions } from "@/types";
import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import { chat, stream } from "@/commands";
import { performRAGEnhancement } from "@/utils/rag-helper";
import type { ProviderConfig, ModelConfig } from "@/types/llm";

interface IChatStreamOptions {
  onFinish: (content: string, reasoning_content: string, res: Response) => void;
  onUpdate: (
    responseText: string,
    fetchText: string,
    reasoningText?: string,
  ) => void;
  onReasoning?: (responseText: string, fetchText: string) => void;
  onError?: (e: Error) => void;
  onController?: (controller: AbortController) => void;
}

const chatInner = async (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  knowledgeOptions?: KnowledgeOptions,
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

  // 使用普通聊天，传入处理后的消息
  return await chat(apiKey, baseUrl, modelName, finalMessages);
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
  const streamMessages = finalMessages.map((msg) => {
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
          }
        })
        .filter(Boolean),
    };
  });

  console.log(streamMessages);

  const requestPayload = {
    messages: streamMessages,
    stream: true,
    model: modelName,
    temperature: 0.3,
    presence_penalty: 0,
    frequency_penalty: 0,
    top_p: 1,
  };
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
