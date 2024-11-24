import useSettingStore, { ELLMProvider, ISetting } from "@/stores/useSettingStore.ts";
import { Message } from "@/types";
import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import { chat, stream } from "@/commands";

interface IChatStreamOptions {
  onFinish: (text: string, res: Response) => void;
  onUpdate: (responseText: string, fetchText: string) => void;
  onError?: (e: Error) => void;
  onController?: (controller: AbortController) => void;
  notAnimate?: boolean;
}

const getCurrentConfig = (llmProviders: ISetting['llmProviders']) => {
  let currentConfig = null;
  if (llmProviders.currentProvider === ELLMProvider.OPENAI) {
    const currentConfigId = llmProviders[ELLMProvider.OPENAI].currentConfigId;
    if (!currentConfigId) return currentConfig;
    currentConfig = llmProviders[ELLMProvider.OPENAI].configs.find(config => config.id === currentConfigId);
  } else if (llmProviders.currentProvider === ELLMProvider.OTHER) {
    const currentConfigId = llmProviders[ELLMProvider.OTHER].currentConfigId;
    if (!currentConfigId) return currentConfig;
    currentConfig = llmProviders[ELLMProvider.OTHER].configs.find(config => config.id === currentConfigId);
  }
  return currentConfig;
}

const chatInner = async (llmProviders: ISetting['llmProviders'], messages: Message[]) => {
  const currentConfig = getCurrentConfig(llmProviders);
  if (!currentConfig) {
    message.error('未添加或未启动大模型配置');
    return null;
  }

  const { apiKey, baseUrl, currentModel } = currentConfig;
  if (!currentModel) {
    message.error('未添加或未启动具体模型');
    return null;
  }
  return await chat(apiKey, baseUrl, currentModel, messages);
}

export const chatStreamInner = (llmProviders: ISetting['llmProviders'], messages: Message[], options: IChatStreamOptions) => {
  const currentConfig = getCurrentConfig(llmProviders);
  if (!currentConfig) {
    options.onError?.(new Error('无法获取到当前 LLM 配置'));
    return;
  }

  const { apiKey, baseUrl, currentModel } = currentConfig;
  const chatPath = `${baseUrl}chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  const requestPayload = {
    messages,
    stream: true,
    model: currentModel,
    temperature: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    top_p: 1,
  };
  const controller = new AbortController();
  options.onController?.(controller);
  stream(chatPath, requestPayload, headers, controller, (text: string) => {
    const json = JSON.parse(text);
    const choices = json.choices as Array<{
      delta: {
        content: string;
      };
    }>;
    return choices[0]?.delta?.content;
  }, options);
}

const useChatLLM = () => {
  const {
    llmProviders
  } = useSettingStore(state => ({
    llmProviders: state.setting.llmProviders,
  }));

  const chatLLM = useMemoizedFn(async (messages: Message[]) => {
    return await chatInner(llmProviders, messages);
  });

  const chatLLMStream = useMemoizedFn((messages: Message[], options: IChatStreamOptions) => {
    return chatStreamInner(llmProviders, messages, options);
  });

  return {
    chatLLM,
    chatLLMStream,
  }
}

export const chatLLM = async (messages: Message[]) => {
  const llmProviders = useSettingStore.getState().setting.llmProviders;
  return await chatInner(llmProviders, messages);
}

export const chatLLMStream = (messages: Message[], options: IChatStreamOptions) => {
  const llmProviders = useSettingStore.getState().setting.llmProviders;
  chatStreamInner(llmProviders, messages, options);
}

export const chatWithGPT35 = async (messages: Message[]) => {
  const llmProviders = useSettingStore.getState().setting.llmProviders;
  const configId = llmProviders[ELLMProvider.OPENAI].currentConfigId;
  const currentConfig = llmProviders[ELLMProvider.OPENAI].configs.find(config => config.id === configId)
  if (!currentConfig) return null;
  const { apiKey, baseUrl } = currentConfig;
  return await chat(apiKey, baseUrl, 'gpt-3.5-turbo', messages);
}

export default useChatLLM;
