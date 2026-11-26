/**
 * 语音输入设置面板（VoiceSection 的 input Tab）：选识别服务（系统识别 / 已注册的识别插件），
 * 识别账号与模型在插件详情 › 设置中填写；识别后可选 AI 整理（模型在功能分配中设置）。
 * 插件停用不改写选择，只提示；选用前要求账号已保存。
 */

import { voiceText, useVoiceSettingsI18n, type VoiceSettingsMessageKey } from "./voice.i18n";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Mic, Monitor } from "lucide-react";
import { SettingRow, Button, Segmented, Textarea, cn, toast } from "@tau/ui";
import {
  DEFAULT_SPEECH_REFINEMENT,
  defaultSpeechInputSetting,
  type ASRAvailability,
} from "@tau/asr";
import { rendererASRRegistry } from "@/app/plugins/asr-registry";
import { useDesktopPlugins } from "@/app/plugins/context";
import { useSettingsStore } from "@/app/settingsStore";
import { invoke } from "@/electron";
import { ensureModule } from "@/commands/module-init";
import { updateSpeechInput } from "@/services/speechInput";
import { openProviderSettings } from "@/services/open-provider-settings";
import useSettingStore from "@/stores/useSettingStore";
import { SettingsGroup, SettingsNote } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const NATIVE = "native";

function useNativeAvailability(language: string) {
  const [availability, setAvailability] = useState<ASRAvailability | null>(null);
  useEffect(() => {
    let alive = true;
    void ensureModule("speech-input")
      .then(() => invoke<ASRAvailability>("speech-input:probe", language))
      .then(result => alive && setAvailability(result))
      .catch(
        error =>
          alive &&
          setAvailability({
            state: "unavailable",
            reason: errorText(error),
            execution: "device",
            textUpdates: "final-only",
            timestamps: "none",
            speakerLabels: false,
          })
      );
    return () => {
      alive = false;
    };
  }, [language]);
  return availability;
}

function EngineCard({
  selected,
  icon,
  title,
  description,
  status,
  disabled,
  onSelect,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  status?: React.ReactNode;
  disabled?: boolean;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "rounded-tau-md bg-surface relative min-w-0 px-3.5 py-3 text-left",
        "ease-tau-out transition-[box-shadow,background] duration-[160ms]",
        "disabled:cursor-default disabled:opacity-55",
        selected
          ? "bg-accent-soft/40 shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
          : "enabled:hover:bg-surface-hover shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
      )}
    >
      <span className="text-tau-body text-ink-1 flex items-center gap-2 font-semibold">
        <span className="text-ink-2 flex-none">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {selected && <Check size={14} className="text-accent-text flex-none" />}
      </span>
      <span className="text-tau-meta text-ink-2 mt-1 block leading-normal">{description}</span>
      {status && <span className="mt-2 block">{status}</span>}
    </button>
  );
}

export function VoiceInputPanel() {
  useVoiceSettingsI18n();

  const runtime = useDesktopPlugins();
  const setting =
    useSettingStore(state => state.setting.speechInput) ?? defaultSpeechInputSetting();
  const refinementModel = useSettingStore(
    state => state.setting.llmUsageSettings.speechInputRefinement
  );
  const refinementLabel = useSettingStore(state => {
    const selection = state.setting.llmUsageSettings.speechInputRefinement;
    const provider = state.setting.llmProviders.find(item => item.id === selection?.providerId);
    const model = provider?.models.find(item => item.id === selection?.modelId);
    return provider && model ? `${provider.name} · ${model.name || model.id}` : "";
  });
  const native = useNativeAvailability(setting.language);
  const sections = (runtime?.listSettings() ?? []).filter(item => item.definition.target === "asr");
  useSyncExternalStore(rendererASRRegistry.subscribe, rendererASRRegistry.getSnapshot);
  const registered = new Set(rendererASRRegistry.list().map(item => item.context.pluginId));
  const [busy, setBusy] = useState(false);
  const refinement = setting.refinement ?? DEFAULT_SPEECH_REFINEMENT;
  const [instructions, setInstructions] = useState(refinement.instructions);
  const activePlugin = setting.active === "plugin" ? setting.plugin.id : "";
  const missingPlugin =
    !!activePlugin && !sections.some(item => item.context.pluginId === activePlugin);

  const run = async (operation: unknown, success?: VoiceSettingsMessageKey) => {
    setBusy(true);
    try {
      await updateSpeechInput(operation);
      if (success) toast.success(voiceText(success));
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const select = (pluginId: string) => {
    if (pluginId === NATIVE) return void run({ kind: "select" }, "feedback.nativeSelected");
    const account = setting.plugin.configurations[pluginId];
    const section = sections.find(item => item.context.pluginId === pluginId);
    // 未保存账号时先去插件页填写，保存后回来选用
    if (!account) return section && openProviderSettings(pluginId, section.key, "voice");
    void run({ kind: "select", pluginId, expected: account }, "feedback.serviceSelected");
  };

  const nativeStatus =
    native === null ? (
      <StatusChip>{voiceText("ui.checking")}</StatusChip>
    ) : native.state === "ready" ? (
      <StatusChip tone="ok">{voiceText("ui.available")}</StatusChip>
    ) : native.state === "unsupported" ? (
      <StatusChip tone="neutral">{voiceText("ui.notSupportedOnThisDevice")}</StatusChip>
    ) : (
      <StatusChip tone="warn">{voiceText("ui.setupRequired")}</StatusChip>
    );

  return (
    <>
      <SettingsGroup
        title={voiceText("ui.recognitionService")}
        description={voiceText("ui.voiceInputIsUnavailableOnDesktopSo")}
        bare
      >
        <div
          role="radiogroup"
          aria-label={voiceText("ui.recognitionService")}
          className="grid grid-cols-3 gap-2"
        >
          <EngineCard
            selected={setting.active === "native"}
            icon={<Monitor size={15} />}
            title={voiceText("ui.systemRecognition")}
            description={voiceText("ui.useRealTimeSystemRecognitionRecordingsStay")}
            status={nativeStatus}
            disabled={busy}
            onSelect={() => select(NATIVE)}
          />
          {sections.map(section => {
            const pluginId = section.context.pluginId;
            const configured = Object.hasOwn(setting.plugin.configurations, pluginId);
            return (
              <EngineCard
                key={pluginId}
                selected={activePlugin === pluginId}
                icon={<Mic size={15} />}
                title={section.definition.title}
                description={voiceText("ui.cloudRecognitionRecordingsAreSentToThis")}
                status={
                  !registered.has(pluginId) ? (
                    <StatusChip tone="warn">{voiceText("ui.pluginNotReady")}</StatusChip>
                  ) : configured ? (
                    <StatusChip tone="ok">{voiceText("ui.configured")}</StatusChip>
                  ) : (
                    <StatusChip>{voiceText("ui.notConfigured")}</StatusChip>
                  )
                }
                disabled={busy}
                onSelect={() => select(pluginId)}
              />
            );
          })}
        </div>
      </SettingsGroup>
      {missingPlugin && (
        <SettingsNote>{voiceText("ui.theSelectedRecognitionPluginIsDisabledOr")}</SettingsNote>
      )}
      {native && native.state !== "ready" && native.reason && setting.active === "native" && (
        <SettingsNote>{native.reason}</SettingsNote>
      )}
      {sections.length === 0 && (
        <SettingsNote>{voiceText("ui.installASpeechRecognitionPluginSuchAs")}</SettingsNote>
      )}

      {sections.length > 0 && (
        <SettingsGroup
          title={voiceText("ui.recognitionAccounts")}
          description={voiceText("ui.configureTheAccountAndRecognitionModelOn")}
        >
          {sections.map(section => {
            const pluginId = section.context.pluginId;
            const account = setting.plugin.configurations[pluginId];
            return (
              <SettingRow
                key={section.key}
                title={section.definition.title}
                description={account?.modelId || voiceText("ui.notConfigured2")}
              >
                <Button
                  size="sm"
                  onClick={() => openProviderSettings(pluginId, section.key, "voice")}
                >
                  {account ? voiceText("ui.editConfiguration") : voiceText("ui.configure")}
                </Button>
              </SettingRow>
            );
          })}
        </SettingsGroup>
      )}

      <SettingsGroup title={voiceText("ui.afterRecognition")}>
        <SettingRow
          title={voiceText("ui.cleanUpTextWithAI")}
          description={
            refinementModel
              ? voiceText("ui.addPunctuationAndRemoveRepeatedSpeechWhile")
              : voiceText("ui.offAssignAModelToVoiceInput")
          }
        >
          {refinementModel && (
            <span className="text-tau-meta text-ink-2 max-w-[220px] truncate">
              {refinementLabel || voiceText("ui.modelUnavailable")}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => useSettingsStore.setState({ section: "llm", llmTab: "assignment" })}
          >
            {refinementModel ? voiceText("ui.changeModel") : voiceText("ui.openSettings")}
          </Button>
        </SettingRow>
        {refinementModel && (
          <>
            <SettingRow title={voiceText("ui.cleanupStyle")}>
              <Segmented
                label={voiceText("ui.cleanupStyle")}
                size="md"
                value={refinement.style}
                disabled={busy}
                onValueChange={style =>
                  void run({ kind: "refinement", refinement: { ...refinement, style } })
                }
              >
                <Segmented.Item value="light" label={voiceText("ui.lightCleanup")} />
                <Segmented.Item
                  value="paragraphs"
                  label={voiceText("ui.cleanUpAndAddParagraphs")}
                />
              </Segmented>
            </SettingRow>
            <SettingRow
              title={voiceText("ui.additionalInstructions")}
              description={voiceText("ui.optionalForExampleKeepEnglishAbbreviationsUp")}
            >
              <Textarea
                className="w-[300px]"
                aria-label={voiceText("ui.additionalInstructions")}
                rows={2}
                maxLength={1000}
                value={instructions}
                disabled={busy}
                onChange={event => setInstructions(event.target.value)}
                onBlur={() => {
                  if (instructions.trim() === refinement.instructions) return;
                  void run({ kind: "refinement", refinement: { ...refinement, instructions } });
                }}
              />
            </SettingRow>
          </>
        )}
      </SettingsGroup>
    </>
  );
}
