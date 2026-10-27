/**
 * 语音输入设置面板（VoiceSection 的 input Tab）：选识别服务（系统识别 / 已注册的识别插件），
 * 识别账号与模型在插件详情 › 设置中填写；识别后可选 AI 整理（模型在功能分配中设置）。
 * 插件停用不改写选择，只提示；选用前要求账号已保存。
 */

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

  const run = async (operation: unknown, success?: string) => {
    setBusy(true);
    try {
      await updateSpeechInput(operation);
      if (success) toast.success(success);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const select = (pluginId: string) => {
    if (pluginId === NATIVE) return void run({ kind: "select" }, "已改用系统识别");
    const account = setting.plugin.configurations[pluginId];
    const section = sections.find(item => item.context.pluginId === pluginId);
    // 未保存账号时先去插件页填写，保存后回来选用
    if (!account) return section && openProviderSettings(pluginId, section.key, "voice");
    void run({ kind: "select", pluginId, expected: account }, "已切换识别服务");
  };

  const nativeStatus =
    native === null ? (
      <StatusChip>检测中</StatusChip>
    ) : native.state === "ready" ? (
      <StatusChip tone="ok">可用</StatusChip>
    ) : native.state === "unsupported" ? (
      <StatusChip tone="neutral">此设备不支持</StatusChip>
    ) : (
      <StatusChip tone="warn">需要准备</StatusChip>
    );

  return (
    <>
      <SettingsGroup title="识别服务" description="搜索、聊天与编辑器的语音输入使用这里的选择" bare>
        <div role="radiogroup" aria-label="识别服务" className="grid grid-cols-3 gap-2">
          <EngineCard
            selected={setting.active === "native"}
            icon={<Monitor size={15} />}
            title="系统识别"
            description="使用系统自带的实时识别，录音不离开本机"
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
                description="云端识别 · 录音会发送到该服务"
                status={
                  !registered.has(pluginId) ? (
                    <StatusChip tone="warn">插件未就绪</StatusChip>
                  ) : configured ? (
                    <StatusChip tone="ok">已配置</StatusChip>
                  ) : (
                    <StatusChip>待配置</StatusChip>
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
        <SettingsNote>
          当前选用的识别插件已停用或卸载，配置仍保留；启用后恢复使用，或改选系统识别。
        </SettingsNote>
      )}
      {native && native.state !== "ready" && native.reason && setting.active === "native" && (
        <SettingsNote>{native.reason}</SettingsNote>
      )}
      {sections.length === 0 && (
        <SettingsNote>安装语音识别插件（如豆包语音）后，可在这里配置云端识别账号。</SettingsNote>
      )}

      {sections.length > 0 && (
        <SettingsGroup
          title="识别账号"
          description="账号与识别模型在插件页填写；保存后回到这里选用"
        >
          {sections.map(section => {
            const pluginId = section.context.pluginId;
            const account = setting.plugin.configurations[pluginId];
            return (
              <SettingRow
                key={section.key}
                title={section.definition.title}
                description={account?.modelId || "未配置"}
              >
                <Button
                  size="sm"
                  onClick={() => openProviderSettings(pluginId, section.key, "voice")}
                >
                  {account ? "修改配置" : "去配置"}
                </Button>
              </SettingRow>
            );
          })}
        </SettingsGroup>
      )}

      <SettingsGroup title="识别后">
        <SettingRow
          title="AI 整理文本"
          description={
            refinementModel
              ? "补标点、去掉口语重复，不改变原意；在功能分配中清除模型即关闭"
              : "未开启：在「大语言模型 › 功能分配」为「语音输入整理」选择模型后生效"
          }
        >
          {refinementModel && (
            <span className="text-tau-meta text-ink-2 max-w-[220px] truncate">
              {refinementLabel || "模型已不可用"}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => useSettingsStore.setState({ section: "llm", llmTab: "assignment" })}
          >
            {refinementModel ? "更换模型" : "去设置"}
          </Button>
        </SettingRow>
        {refinementModel && (
          <>
            <SettingRow title="整理方式">
              <Segmented
                label="整理方式"
                size="md"
                value={refinement.style}
                disabled={busy}
                onValueChange={style =>
                  void run({ kind: "refinement", refinement: { ...refinement, style } })
                }
              >
                <Segmented.Item value="light" label="轻度整理" />
                <Segmented.Item value="paragraphs" label="整理并分段" />
              </Segmented>
            </SettingRow>
            <SettingRow title="补充要求" description="可选，例如保留英文缩写；最多 1000 字">
              <Textarea
                className="w-[300px]"
                aria-label="补充要求"
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
