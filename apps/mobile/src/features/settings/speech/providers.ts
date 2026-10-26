// 识别插件投影：已启用且注册了识别能力与 asr 设置分区的插件；账号配置存于 speechInput.plugin。

import { useMemo } from "react";
import { copyJson } from "@tau/plugins/host";
import { isProviderFormComplete, type JsonValue, type ProviderForm } from "@tau/plugins";
import type { SpeechInputSetting } from "@tau/asr";
import { useMobilePlugins } from "../../../app/plugins/context";

export interface SpeechInputProvider {
  id: string;
  name: string;
  form: ProviderForm | null;
  /** 初始模型：账号已保存的模型优先，否则取插件声明的第一个 */
  defaultModelId: string;
  stored(setting: SpeechInputSetting): JsonValue | undefined;
  modelId(setting: SpeechInputSetting): string;
  isConfigured(setting: SpeechInputSetting): boolean;
}

export function useSpeechInputProviders(): readonly SpeechInputProvider[] {
  const runtime = useMobilePlugins();
  const revision = runtime?.getSnapshot();
  return useMemo(() => {
    if (!runtime || revision === undefined) return [];
    return runtime.asr
      .list()
      .filter(item => runtime.active(item.context))
      .map(({ context, definition }) => {
        const section = [...runtime.settings.values()].find(
          item => item.context === context && item.definition.target === "asr"
        );
        const form = section?.definition.form ?? null;
        const defaultModelId = section?.definition.models?.[0]?.id ?? "";
        const account = (setting: SpeechInputSetting) =>
          Object.hasOwn(setting.plugin.configurations, context.pluginId)
            ? setting.plugin.configurations[context.pluginId]
            : undefined;
        const stored = (setting: SpeechInputSetting) => {
          const value = account(setting);
          return value ? (copyJson(value.config as JsonValue) as JsonValue) : undefined;
        };
        return {
          id: context.pluginId,
          name: section?.definition.title ?? definition.name,
          form,
          defaultModelId,
          stored,
          modelId: setting => account(setting)?.modelId || defaultModelId,
          isConfigured: setting =>
            form ? isProviderFormComplete(form, stored(setting)) : account(setting) !== undefined,
        };
      });
  }, [runtime, revision]);
}
