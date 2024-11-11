import useSettingStore, { ELLMProvider, ISetting } from "@/stores/useSettingStore.ts";
import { Message } from "@/types";
import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import { chat } from "@/commands";

const chatInner = async (llmProviders: ISetting['llmProviders'], messages: Message[]) => {
  if (llmProviders.currentProvider === ELLMProvider.OPENAI) {
    const currentConfigId = llmProviders[ELLMProvider.OPENAI].currentConfigId;
    const currentConfig = llmProviders[ELLMProvider.OPENAI].configs.find(config => config.id === currentConfigId);
    if (!currentConfig) {
      message.error('无法获取到 Open AI 相关配置');
      return null;
    }
    const { apiKey, baseUrl, currentModel } = currentConfig;
    return await chat(apiKey, baseUrl, currentModel, messages);
  } else if (llmProviders.currentProvider === ELLMProvider.DOUBAO) {
    const currentConfigId = llmProviders[ELLMProvider.DOUBAO].currentConfigId;
    const currentConfig = llmProviders[ELLMProvider.DOUBAO].configs.find(config => config.id === currentConfigId);
    if (!currentConfig) {
      message.error('无法获取到豆包相关配置');
      return null;
    }
    const { apiKey, baseUrl, currentModel } = currentConfig;
    return await chat(apiKey, baseUrl, currentModel, messages);
  } else {
    message.error('暂不支持该 LLM Provider: ' + llmProviders.currentProvider);
    return null;
  }
}

const useChatLLM = () => {
  const {
    llmProviders
  } = useSettingStore(state => ({
    llmProviders: state.setting.llmProviders,
  }))
  
  return useMemoizedFn(async (messages: Message[]) => {
    return await chatInner(llmProviders, messages);
  })
}

export const chatLLM = async (messages: Message[]) => {
  const llmProviders = useSettingStore.getState().setting.llmProviders;
  return await chatInner(llmProviders, messages);
}

export default useChatLLM;
