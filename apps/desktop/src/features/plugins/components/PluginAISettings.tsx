import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button, Input, Select, SettingRow, Switch, cn } from "@tau/ui";
import { configurePluginAI, getPluginAIInfo, pluginAIModels } from "@/commands/plugin-ai";
import { useSettingsStore } from "@/app/settingsStore";
import type { PluginAIConfig } from "@/types/plugin-ai";
import { PLUGIN_AI_CAPABILITIES } from "@tau/plugins";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardIcon,
  SettingsCardSection,
} from "./SettingsCard";

export function PluginAISettings({ pluginId }: { pluginId: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["plugin-ai", pluginId],
    queryFn: () => getPluginAIInfo(pluginId),
    refetchOnWindowFocus: true,
  });
  const models = useQuery({
    queryKey: ["plugin-ai-models"],
    queryFn: pluginAIModels,
    refetchOnWindowFocus: true,
  });
  const [draft, setDraft] = useState<PluginAIConfig>();
  useEffect(() => {
    if (query.data) setDraft(query.data.config);
  }, [query.data]);
  const save = useMutation({
    mutationFn: (config: PluginAIConfig) => configurePluginAI(pluginId, config),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["plugin-ai", pluginId] });
    },
  });
  if (query.error) return <p role="alert">无法读取 AI 配置：{query.error.message}</p>;
  if (!query.data || (!query.data.features.length && !query.data.hostFeatures?.length) || !draft)
    return null;
  const options = models.data ?? [];
  return (
    <div className="mb-5">
      <SettingsCard
        header={
          <SettingsCardHeader
            icon={<SettingsCardIcon icon={Sparkles} />}
            title="AI 配置"
            description="插件调用 AI 时使用的模型与每日额度"
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => useSettingsStore.getState().openAIUsage(pluginId)}
                >
                  查看用量
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    useSettingsStore.setState({
                      open: true,
                      section: "llm",
                      llmTab: "providers",
                    })
                  }
                >
                  管理模型
                </Button>
              </>
            }
          />
        }
        footer={
          <div className="flex items-center gap-2">
            <p
              role={save.error ? "alert" : undefined}
              className={cn(
                "text-tau-meta min-w-0 flex-1",
                save.error ? "text-danger" : "text-ink-3"
              )}
            >
              {save.error?.message ?? "额度按本机自然日统计"}
            </p>
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(draft)}>
              保存 AI 配置
            </Button>
          </div>
        }
      >
        {query.data.hostFeatures?.map(capability => (
          <p key={capability} className="text-tau-meta text-ink-2 px-[18px] pt-3">
            {PLUGIN_AI_CAPABILITIES[capability]?.name ?? capability}
            沿用应用对应功能的模型分配，无需在此另选模型。使用权限在插件的「权限」页管理，下方额度同时适用于该能力。
          </p>
        ))}
        {query.data.features.length > 0 && (
          <SettingsCardSection title="模型分配">
            <SettingRow title="允许此插件调用 AI">
              <Switch
                aria-label="允许此插件调用 AI"
                checked={draft.enabled}
                disabled={save.isPending}
                onCheckedChange={enabled => {
                  const next = { ...draft, enabled };
                  setDraft(next);
                  save.mutate(next);
                }}
              />
            </SettingRow>
            {query.data.features.map(feature => {
              const assignment = draft.assignments[feature.id];
              const selected = options.findIndex(
                model =>
                  model.providerId === assignment?.providerId &&
                  model.modelId === assignment?.modelId
              );
              return (
                <SettingRow key={feature.id} title={feature.name} description={feature.description}>
                  <Select
                    className="w-[300px] max-w-full"
                    aria-label={feature.name}
                    value={selected < 0 ? "" : String(selected)}
                    options={[
                      {
                        value: "",
                        label: assignment ? "原模型已不可用，请重新分配" : "请选择模型",
                      },
                      ...options.map((model, index) => ({
                        value: String(index),
                        label: model.label,
                      })),
                    ]}
                    onValueChange={value => {
                      const model = value === "" ? undefined : options[Number(value)];
                      setDraft({
                        ...draft,
                        assignments: {
                          ...draft.assignments,
                          [feature.id]: model
                            ? {
                                providerId: model.providerId,
                                modelId: model.modelId,
                              }
                            : null,
                        },
                      });
                    }}
                  />
                </SettingRow>
              );
            })}
            {models.error && (
              <p role="alert" className="text-tau-meta text-danger px-3 pb-2">
                无法读取模型列表
              </p>
            )}
          </SettingsCardSection>
        )}
        <SettingsCardSection
          title="额度"
          description="每次按模型上下文容量与输出上限预占 Token，完成后按已知用量结算；用量未知时保留预占。关闭 AI 授权取消插件自定义 AI 请求；宿主 AI 能力在「权限」页撤权后取消，已发生的消费无法撤销。"
        >
          {LIMITS.map(([key, label]) => (
            <SettingRow key={key} title={label}>
              <Input
                wrapperClassName="w-[140px]"
                aria-label={label}
                type="number"
                min={1}
                value={draft[key]}
                onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })}
              />
            </SettingRow>
          ))}
        </SettingsCardSection>
      </SettingsCard>
    </div>
  );
}

const LIMITS = [
  ["dailyRequests", "每日请求次数"],
  ["dailyTokens", "每日 Token 额度"],
  ["concurrency", "最大并发"],
] as const;
