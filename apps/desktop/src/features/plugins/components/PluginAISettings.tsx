import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Panel, Select, Switch } from "@tau/ui";
import { configurePluginAI, getPluginAIInfo, pluginAIModels } from "@/commands/plugin-ai";
import { useSettingsStore } from "@/app/settingsStore";
import type { PluginAIConfig } from "@/types/plugin-ai";
import { PLUGIN_AI_CAPABILITIES } from "@tau/plugins";

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
    <Panel className="mb-5 flex flex-col gap-3">
      <h3 className="text-tau-body font-semibold">AI 配置</h3>
      {query.data.hostFeatures?.map(capability => (
        <p key={capability} className="text-tau-meta text-ink-2">
          {PLUGIN_AI_CAPABILITIES[capability]?.name ?? capability}
          沿用应用对应功能的模型分配，无需在此另选模型。使用权限在插件的「权限」页管理，下方额度同时适用于该能力。
        </p>
      ))}
      {query.data.features.length > 0 && (
        <label className="flex items-center justify-between gap-3">
          允许此插件调用 AI
          <Switch
            checked={draft.enabled}
            disabled={save.isPending}
            onCheckedChange={enabled => {
              const next = { ...draft, enabled };
              setDraft(next);
              save.mutate(next);
            }}
          />
        </label>
      )}
      {query.data.features.map(feature => {
        const assignment = draft.assignments[feature.id];
        const selected = options.findIndex(
          model =>
            model.providerId === assignment?.providerId && model.modelId === assignment?.modelId
        );
        return (
          <label key={feature.id} className="flex flex-col gap-1">
            <span>{feature.name}</span>
            {feature.description && (
              <span className="text-tau-meta text-ink-2">{feature.description}</span>
            )}
            <Select
              value={selected < 0 ? "" : String(selected)}
              options={[
                { value: "", label: assignment ? "原模型已不可用，请重新分配" : "请选择模型" },
                ...options.map((model, index) => ({ value: String(index), label: model.label })),
              ]}
              onValueChange={value => {
                const model = value === "" ? undefined : options[Number(value)];
                setDraft({
                  ...draft,
                  assignments: {
                    ...draft.assignments,
                    [feature.id]: model
                      ? { providerId: model.providerId, modelId: model.modelId }
                      : null,
                  },
                });
              }}
            />
          </label>
        );
      })}
      {models.error && <p role="alert">无法读取模型列表</p>}
      {(
        [
          ["dailyRequests", "每日请求次数"],
          ["dailyTokens", "每日 Token 额度"],
          ["concurrency", "最大并发"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center justify-between gap-3">
          {label}
          <Input
            type="number"
            min={1}
            value={draft[key]}
            onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
      <p className="text-tau-meta text-ink-2">
        额度按本机自然日统计。每次按模型上下文容量与输出上限预占
        Token，完成后按已知用量结算；用量未知时保留预占。关闭 AI 授权取消插件自定义 AI 请求；宿主 AI
        能力在「权限」页撤权后取消，已发生的消费无法撤销。
      </p>
      {save.error && <p role="alert">{save.error.message}</p>}
      <div className="flex gap-2">
        <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
          保存 AI 配置
        </Button>
        <Button onClick={() => useSettingsStore.getState().openAIUsage(pluginId)}>查看用量</Button>
        <Button
          onClick={() =>
            useSettingsStore.setState({ open: true, section: "llm", llmTab: "providers" })
          }
        >
          管理模型
        </Button>
      </div>
    </Panel>
  );
}
