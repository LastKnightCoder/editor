// 语音输入页的「AI 整理」：分配了「语音输入整理」模型即开启，清除即关闭（与桌面同义）。

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { LLMUsageConfigV2 } from "@tau/ai/models";
import { DEFAULT_SPEECH_REFINEMENT } from "@tau/asr";
import { ActionSheet } from "../../../components/ActionSheet";
import { GroupLabel } from "../../../components/GroupLabel";
import { toast } from "../../../components/toast";
import { useNavigator } from "../../../router";
import { findAssignedModel, modelLabel } from "../../../services/ai-settings";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { ModelPickerSheet } from "../ai/AiUi";
import { useAiSettings } from "../ai/useAiSettings";

const STYLES = [
  { value: "light", label: "轻度整理", desc: "只补标点、去掉口头禅，保留原话" },
  { value: "paragraphs", label: "整理并分段", desc: "在话题转折处分段，适合长段口述" },
] as const;

export function SpeechRefinementGroup() {
  const navigator = useNavigator();
  const { setting, providers, usage, mutate } = useAiSettings();
  const [picking, setPicking] = useState(false);
  const [stylePicking, setStylePicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const assigned = findAssignedModel(setting, "speechInputRefinement");
  const stale = !!usage.speechInputRefinement && !assigned;
  const style = setting?.speechInput?.refinement?.style ?? DEFAULT_SPEECH_REFINEMENT.style;
  const styleLabel = STYLES.find(item => item.value === style)?.label ?? "";

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const assign = async (model: LLMUsageConfigV2 | null) => {
    if (await run(() => mutate({ kind: "assign", feature: "speechInputRefinement", model })))
      setPicking(false);
  };

  return (
    <>
      <GroupLabel>AI 整理</GroupLabel>
      <GroupCard>
        <GroupRow
          onClick={() =>
            providers.length
              ? setPicking(true)
              : navigator.push("settingsModule", { module: "ai-models" })
          }
        >
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-body block font-medium">整理模型</span>
            <span className="text-ink-3 text-tau-sm block truncate">
              {assigned ? "松手后自动补标点、去口头禅" : "未开启 · 选择模型后生效"}
            </span>
          </span>
          <span className="text-ink-3 text-tau-meta max-w-[42%] shrink-0 truncate">
            {assigned
              ? modelLabel(assigned.model)
              : stale
                ? "模型已不可用"
                : providers.length
                  ? "未选择"
                  : "去添加服务商"}
          </span>
          <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
        </GroupRow>
        {assigned && (
          <GroupRow disabled={busy} onClick={() => setStylePicking(true)}>
            <span className="text-ink-1 text-tau-body flex-1 font-medium">整理方式</span>
            <span className="text-ink-3 text-tau-meta shrink-0">{styleLabel}</span>
            <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
          </GroupRow>
        )}
      </GroupCard>
      <GroupNote>整理会把识别文字发给所选模型；整理失败时保留原文，不会丢字。</GroupNote>

      <ModelPickerSheet
        open={picking}
        title="语音输入整理使用的模型"
        description="建议选响应快、价格低的模型。"
        providers={providers}
        value={usage.speechInputRefinement}
        busy={busy}
        onSelect={model => void assign(model)}
        onOpenProvider={providerId => {
          setPicking(false);
          navigator.push("aiProvider", { providerId });
        }}
        onClose={() => setPicking(false)}
      />
      <ActionSheet
        open={stylePicking}
        title="整理方式"
        items={STYLES.map(item => ({
          label: item.label,
          desc: item.desc,
          selected: item.value === style,
          onClick: () => void run(() => mutate({ kind: "setSpeechRefinement", style: item.value })),
        }))}
        onClose={() => setStylePicking(false)}
      />
    </>
  );
}
