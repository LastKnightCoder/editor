// AI 模型（我的 › AI › AI 模型）：上方按功能分配模型，下方管理服务商。
// API Key 由原生持有，页面只看到 configured 与末 4 位提示。

import { lazy, Suspense, useState } from "react";
import { AudioLines, ChevronRight, MessagesSquare, Plus } from "lucide-react";
import { GroupLabel } from "../../../components/GroupLabel";
import { toast } from "../../../components/toast";
import { useNavigator } from "../../../router";
import { LLM_FEATURES, findAssignedModel, modelLabel } from "../../../services/ai-settings";
import type { LLMUsageConfigV2 } from "@tau/ai/models";
import type { LlmFeatureKey } from "../../../types";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { AiBadge, ModelPickerSheet, ProviderTile } from "./AiUi";
import { providerSummary, useAiSettings } from "./useAiSettings";

// 预设目录含全部内置模型元数据，只在打开「添加服务商」时加载
const AddProviderSheet = lazy(() =>
  import("./AddProviderSheet").then(module => ({ default: module.AddProviderSheet }))
);

const FEATURE_ICONS: Record<LlmFeatureKey, { icon: typeof AudioLines; tone: string }> = {
  chat: { icon: MessagesSquare, tone: "bg-accent-soft text-accent-text" },
  speechInputRefinement: { icon: AudioLines, tone: "bg-tag-1-soft text-tag-1" },
};

export function AiModelsSection() {
  const navigator = useNavigator();
  const { setting, providers, usage, mutate } = useAiSettings();
  const [picking, setPicking] = useState<LlmFeatureKey | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const pickingFeature = LLM_FEATURES.find(feature => feature.key === picking);
  const openProvider = (providerId: string) => navigator.push("aiProvider", { providerId });

  const assign = async (feature: LlmFeatureKey, model: LLMUsageConfigV2 | null) => {
    setBusy(true);
    try {
      await mutate({ kind: "assign", feature, model });
      setPicking(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-enter space-y-1">
      <GroupLabel>功能分配</GroupLabel>
      <GroupCard>
        {LLM_FEATURES.map(feature => {
          const assigned = findAssignedModel(setting, feature.key);
          const visual = FEATURE_ICONS[feature.key];
          const Icon = visual.icon;
          const stale = !!usage[feature.key] && !assigned;
          return (
            <GroupRow
              key={feature.key}
              onClick={() => (providers.length ? setPicking(feature.key) : setAdding(true))}
            >
              <span
                className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl ${visual.tone}`}
              >
                <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-body block font-medium">{feature.label}</span>
                <span className="text-ink-3 text-tau-sm block truncate">{feature.desc}</span>
              </span>
              <span className="text-ink-3 text-tau-meta max-w-[42%] shrink-0 truncate">
                {assigned ? modelLabel(assigned.model) : stale ? "模型已不可用" : "未分配"}
              </span>
              <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
            </GroupRow>
          );
        })}
      </GroupCard>
      <GroupNote>每个功能单独选模型：对话用能力强的模型，语音整理用便宜快的。</GroupNote>

      <GroupLabel>服务商</GroupLabel>
      <GroupCard>
        {providers.map(provider => (
          <GroupRow key={provider.id} onClick={() => openProvider(provider.id)}>
            <ProviderTile provider={provider} />
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body flex items-center font-medium">
                <span className="truncate">{provider.name}</span>
                {provider.configured ? (
                  <AiBadge tone="ok">可用</AiBadge>
                ) : (
                  <AiBadge tone="warn">未填 Key</AiBadge>
                )}
              </span>
              <span className="text-ink-3 text-tau-sm block truncate">
                {providerSummary(provider)}
              </span>
            </span>
            <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
          </GroupRow>
        ))}
        <GroupRow onClick={() => setAdding(true)}>
          <span className="bg-page text-accent-text grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
            <Plus size={18} aria-hidden="true" />
          </span>
          <span className="text-accent-text text-tau-body flex-1 font-medium">添加服务商</span>
        </GroupRow>
      </GroupCard>
      <GroupNote>API Key 只保存在这台手机上，不随数据库同步。</GroupNote>

      {pickingFeature && (
        <ModelPickerSheet
          open={!!picking}
          title={`${pickingFeature.label}使用的模型`}
          providers={providers}
          value={usage[pickingFeature.key]}
          busy={busy}
          onSelect={model => void assign(pickingFeature.key, model)}
          onOpenProvider={providerId => {
            setPicking(null);
            openProvider(providerId);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {adding && (
        <Suspense fallback={null}>
          <AddProviderSheet
            open={adding}
            existing={providers}
            onClose={() => setAdding(false)}
            onPick={draft => {
              setAdding(false);
              navigator.push("aiProvider", draft);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
