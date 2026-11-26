import { speechText, speechValue, useSpeechSettingsI18n } from "./i18n";
// 语音输入设置（我的 › 语音 › 语音输入）：选识别插件；账号在插件页（pluginSettings）填写。
// 手机端系统识别由原生语音识别服务提供。
// 插件停用时不改写选择，只提示；选用要求账号已保存且与当前保存的配置一致。

import { useState } from "react";
import { ChevronRight, Mic, Puzzle } from "lucide-react";
import { copyJson } from "@tau/plugins/host";
import { defaultSpeechInputSetting } from "@tau/asr";
import type { JsonValue } from "@tau/plugins";
import { CheckBubble } from "../../../components/CheckBubble";
import { GroupLabel } from "../../../components/GroupLabel";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import { useMobilePlugins } from "../../../app/plugins/context";
import { useNavigator } from "../../../router";
import {
  enqueueProviderConfigWrite,
  mergeProviderSettings,
} from "../../../services/provider-config";
import { selectPluginProvider } from "../../../services/tauri";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { TtsStatus } from "../tts/components/TtsUi";
import { useSpeechInputProviders } from "./providers";
import { SpeechRefinementGroup } from "./SpeechRefinementGroup";

const NATIVE = "native";

export function SpeechInputSection() {
  useSpeechSettingsI18n();

  const app = useAppContext();
  const navigator = useNavigator();
  const runtime = useMobilePlugins();
  const setting = app.syncSettings.safeSetting;
  const speech = setting?.speechInput ?? defaultSpeechInputSetting();
  const providers = useSpeechInputProviders();
  const [busy, setBusy] = useState("");
  const activePlugin = speech.active === "plugin" ? speech.plugin.id : "";
  const missing = !!activePlugin && !providers.some(item => item.id === activePlugin);
  const nativeSelected = speech.active === NATIVE;

  const select = async (pluginId: string) => {
    if (!setting || !runtime || busy) return;
    const expected =
      pluginId === NATIVE
        ? null
        : (copyJson(speech.plugin.configurations[pluginId] as JsonValue) as JsonValue);
    setBusy(pluginId);
    try {
      await enqueueProviderConfigWrite(async () => {
        const saved = await selectPluginProvider(runtime.workspaceId, "asr", pluginId, expected);
        app.syncSettings.updateSetting(previous => mergeProviderSettings(previous, saved));
      });
      toast.success(speechText("ui.recognitionServiceChanged"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : speechText("ui.couldNotSwitch"));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="page-enter space-y-1">
      {missing && (
        <TtsStatus tone="warning" title={speechText("ui.recognitionPluginDisabled")}>
          {speechText("ui.theSelectedRecognitionPluginIsUnavailableIts")}
        </TtsStatus>
      )}
      {nativeSelected && (
        <TtsStatus
          tone="warning"
          title={speechText("ui.systemRecognitionDependsOnDeviceSpeechServices")}
        >
          {speechText("ui.androidRecognitionIsProvidedByTheDevice")}
        </TtsStatus>
      )}
      <GroupLabel>{speechText("ui.recognitionService")}</GroupLabel>
      <GroupCard>
        <GroupRow
          disabled={!!busy}
          onClick={() => {
            if (speech.active !== NATIVE) void select(NATIVE);
          }}
        >
          <span className="bg-page text-ink-3 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
            <Mic size={17} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-body block font-medium">
              {speechText("ui.systemRecognition")}
            </span>
            <span className="text-ink-3 text-tau-sm block">
              {speechText("ui.useTheSystemRecognitionServiceAvailableOn")}
            </span>
          </span>
          {nativeSelected && <CheckBubble />}
        </GroupRow>
        {providers.map(provider => {
          const configured = provider.isConfigured(speech);
          const selected = activePlugin === provider.id;
          return (
            <GroupRow
              key={provider.id}
              disabled={!!busy}
              onClick={() =>
                configured && !selected
                  ? void select(provider.id)
                  : navigator.push("pluginSettings", { id: provider.settingsId })
              }
            >
              <span className="bg-tag-1-soft text-tag-1 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
                <Mic size={17} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-body block font-medium">{provider.name}</span>
                <span className="text-ink-3 text-tau-sm block truncate">
                  {configured
                    ? speechText("ui.cloudRecognitionRecordingsAreSentToThis")
                    : speechText("ui.accountNotConfigured")}
                </span>
              </span>
              {selected && <CheckBubble />}
              <button
                type="button"
                aria-label={speechText("message.accountFor", { name: speechValue(provider.name) })}
                className="text-ink-3 -mr-1 grid h-9 w-9 place-items-center"
                onClick={event => {
                  event.stopPropagation();
                  navigator.push("pluginSettings", { id: provider.settingsId });
                }}
              >
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </GroupRow>
          );
        })}
      </GroupCard>
      <GroupNote>{speechText("ui.recognitionIsUsedForVoiceInputIn")}</GroupNote>
      <SpeechRefinementGroup />
      {providers.length === 0 && (
        <>
          <div className="h-2" />
          <GroupCard>
            <GroupRow onClick={() => navigator.push("plugins", { tab: "store" })}>
              <Puzzle size={18} className="text-accent-text" aria-hidden="true" />
              <span className="text-accent-text text-tau-body flex-1 font-medium">
                {speechText("ui.installASpeechRecognitionPlugin")}
              </span>
              <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
            </GroupRow>
          </GroupCard>
        </>
      )}
    </div>
  );
}
