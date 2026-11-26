import { speechText, useSpeechSettingsI18n } from "./i18n";
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
  {
    value: "light",
    get label() {
      return speechText("ui.lightCleanup");
    },
    get desc() {
      return speechText("ui.addPunctuationAndRemoveFillerWordsWhile");
    },
  },
  {
    value: "paragraphs",
    get label() {
      return speechText("ui.cleanUpAndAddParagraphs");
    },
    get desc() {
      return speechText("ui.addParagraphBreaksAtTopicChangesSuited");
    },
  },
] as const;

export function SpeechRefinementGroup() {
  useSpeechSettingsI18n();

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
      toast.error(error instanceof Error ? error.message : speechText("ui.couldNotSave"));
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
      <GroupLabel>{speechText("ui.aiCleanup")}</GroupLabel>
      <GroupCard>
        <GroupRow
          onClick={() =>
            providers.length
              ? setPicking(true)
              : navigator.push("settingsModule", { module: "ai-models" })
          }
        >
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-body block font-medium">
              {speechText("ui.cleanupModel")}
            </span>
            <span className="text-ink-3 text-tau-sm block truncate">
              {assigned
                ? speechText("ui.addPunctuationAndRemoveFillerWordsAfter")
                : speechText("ui.offChooseAModelToEnable")}
            </span>
          </span>
          <span className="text-ink-3 text-tau-meta max-w-[42%] shrink-0 truncate">
            {assigned
              ? modelLabel(assigned.model)
              : stale
                ? speechText("ui.modelUnavailable")
                : providers.length
                  ? speechText("ui.notSelected")
                  : speechText("ui.addAProvider")}
          </span>
          <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
        </GroupRow>
        {assigned && (
          <GroupRow disabled={busy} onClick={() => setStylePicking(true)}>
            <span className="text-ink-1 text-tau-body flex-1 font-medium">
              {speechText("ui.cleanupStyle")}
            </span>
            <span className="text-ink-3 text-tau-meta shrink-0">{styleLabel}</span>
            <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
          </GroupRow>
        )}
      </GroupCard>
      <GroupNote>{speechText("ui.cleanupSendsRecognizedTextToTheSelected")}</GroupNote>

      <ModelPickerSheet
        open={picking}
        title={speechText("ui.modelForVoiceInputCleanup")}
        description={speechText("ui.aFastInexpensiveModelIsRecommended")}
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
        title={speechText("ui.cleanupStyle")}
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
