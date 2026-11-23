import { useEffect, useMemo } from "react";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import {
  clampThinkingLevel,
  normalizeStoredThinkingLevel,
  resolveThinkingLevelOptions,
  useThinkingLevels,
} from "@/services/llmCatalog";
import useLLMConfig from "@/hooks/useLLMConfig";
import useSettingStore from "@/stores/useSettingStore";
import useSkillStore from "@/stores/useSkillStore";

/** 对话功能的模型/档位配置与模型选择菜单（纯数据接线，不含发送逻辑） */
export function useChatModelConfig() {
  const {
    provider: chatProviderConfig,
    model: chatModelConfig,
    thinkingLevel: chatDefaultThinkingLevel,
  } = useLLMConfig("chat");

  const llmConfigs = useSettingStore(state => state.setting.llmProviders);
  const skills = useSkillStore(state => state.skills);
  const loadSkills = useSkillStore(state => state.loadSkills);

  // 加载 Skills 数据（用于注入系统 Prompt）
  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // 档位取值：localStorage 有显式值优先，否则回退到功能分配的 chat 默认档位，再回退 "off"
  const [storedThinkingLevel, setStoredThinkingLevel] =
    useLocalStorageState<string>("reasoningEffort");
  // 档位按模型真实能力给（经主进程查预设目录）：目录未收录的模型退回通用档
  const { levels: catalogLevels } = useThinkingLevels(
    chatProviderConfig ?? undefined,
    chatModelConfig?.id ?? ""
  );
  const thinkingLevelOptions = useMemo(
    () =>
      resolveThinkingLevelOptions({
        reasoning: chatModelConfig?.reasoning,
        catalogLevels,
      }),
    [chatModelConfig?.reasoning, catalogLevels]
  );
  const thinkingLevel = clampThinkingLevel(
    normalizeStoredThinkingLevel(storedThinkingLevel || chatDefaultThinkingLevel || "off"),
    thinkingLevelOptions
  );

  // 聊天上传以 pi 为准：文本、图片与文件；文件由模型用 read 工具读取
  const supportImage = chatModelConfig?.input.includes("image") ?? false;

  // 模型选择菜单：按服务商分组（纯数据，由输入区用 @tau/ui Menu 渲染）
  const modelGroups = useMemo(
    () =>
      llmConfigs.map(provider => ({
        key: provider.id,
        label: provider.name,
        children: (provider.models ?? []).map(model => ({
          key: `${provider.id}::${model.id}`,
          label: model.name ?? model.id,
          description: model.name && model.name !== model.id ? model.name : undefined,
        })),
      })),
    [llmConfigs]
  );
  const currentModelKey =
    chatProviderConfig && chatModelConfig
      ? `${chatProviderConfig.id}::${chatModelConfig.id}`
      : undefined;

  // 处理模型选择
  const handleModelSelect = useMemoizedFn(({ key }: { key: string }) => {
    const [providerId, modelId] = key.split("::");
    const { setting, updateLLMUsageSetting } = useSettingStore.getState();
    updateLLMUsageSetting("chat", { ...setting.llmUsageSettings.chat, providerId, modelId });
  });

  return {
    chatProviderConfig,
    chatModelConfig,
    skills,
    supportImage,
    thinkingLevel,
    thinkingLevelOptions,
    setStoredThinkingLevel,
    modelGroups,
    currentModelKey,
    handleModelSelect,
  };
}
