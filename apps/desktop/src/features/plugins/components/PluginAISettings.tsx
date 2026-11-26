import { pluginControlsTranslator, usePluginControlsI18n } from "../controls.i18n";
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
const t = pluginControlsTranslator.t;

export function PluginAISettings({ pluginId }: { pluginId: string }) {
  usePluginControlsI18n();
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
  if (query.error) return <p role="alert">{t("ai.readFailed", { error: query.error.message })}</p>;
  if (!query.data || (!query.data.features.length && !query.data.hostFeatures?.length) || !draft)
    return null;
  const options = models.data ?? [];
  return (
    <div className="mb-5">
      <SettingsCard
        header={
          <SettingsCardHeader
            icon={<SettingsCardIcon icon={Sparkles} />}
            title={t("ai.config")}
            description={t("ai.description")}
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => useSettingsStore.getState().openAIUsage(pluginId)}
                >
                  {t("ai.usage")}
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
                  {t("ai.manage")}
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
              {save.error?.message ?? t("ai.dayHint")}
            </p>
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(draft)}>
              {t("ai.save")}
            </Button>
          </div>
        }
      >
        {query.data.hostFeatures?.map(capability => (
          <p key={capability} className="text-tau-meta text-ink-2 px-[18px] pt-3">
            {PLUGIN_AI_CAPABILITIES[capability]?.name ?? capability}
            {t("ai.hostHint")}
          </p>
        ))}
        {query.data.features.length > 0 && (
          <SettingsCardSection title={t("ai.assignment")}>
            <SettingRow title={t("ai.allowed")}>
              <Switch
                aria-label={t("ai.allowed")}
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
                        label: assignment ? t("ai.modelMissing") : t("ai.chooseModel"),
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
                {t("ai.modelsFailed")}
              </p>
            )}
          </SettingsCardSection>
        )}
        <SettingsCardSection title={t("ai.limit")} description={t("ai.limitHint")}>
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
  ["dailyRequests", t("ai.requests")],
  ["dailyTokens", t("ai.tokens")],
  ["concurrency", t("ai.concurrency")],
] as const;
