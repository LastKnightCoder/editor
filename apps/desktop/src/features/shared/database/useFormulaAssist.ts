import { useMemo } from "react";
import type { DatabaseSlots } from "@tau/database";
import useSettingStore from "@/stores/useSettingStore";
import { piCompleteChat } from "@/services/piLLM";
import type { Role } from "@/constants";

/**
 * 「一句话生成公式」的模型能力：配了对话模型即提供，不另设开关。
 * 只转发构造器给出的消息（列结构，不含行数据）。
 */
export function useFormulaAssist(): ReturnType<NonNullable<DatabaseSlots["useFormulaAssist"]>> {
  const usage = useSettingStore(state => state.setting.llmUsageSettings.chat);
  const providers = useSettingStore(state => state.setting.llmProviders);
  return useMemo(() => {
    const provider = providers.find(item => item.id === usage?.providerId);
    const model = provider?.models.find(item => item.id === usage?.modelId);
    if (!provider || !model) return undefined;
    return async messages => {
      const outcome = await piCompleteChat({
        provider,
        model,
        messages: messages.map(message => ({
          role: message.role as Role,
          content: message.content,
        })),
        thinking: "off",
        source: { feature: "formulaAssist" },
      });
      if (!outcome.ok) throw new Error(outcome.error ?? "模型调用失败");
      return outcome.text;
    };
  }, [providers, usage?.providerId, usage?.modelId]);
}
