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
      toast.success("已切换识别服务");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换失败");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="page-enter space-y-1">
      {missing && (
        <TtsStatus tone="warning" title="识别插件已停用">
          当前选用的识别插件不可用，账号配置仍保留。启用插件后恢复使用，或改选其他识别插件。
        </TtsStatus>
      )}
      {nativeSelected && (
        <TtsStatus tone="warning" title="系统识别依赖设备语音服务">
          Android
          识别能力由设备厂商提供，可能需要联网或安装语言包；没有可用识别服务时请改用识别插件。
        </TtsStatus>
      )}
      <GroupLabel>识别服务</GroupLabel>
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
            <span className="text-ink-1 text-tau-body block font-medium">系统识别</span>
            <span className="text-ink-3 text-tau-sm block">使用设备当前可用的系统识别服务</span>
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
                  {configured ? "云端识别 · 录音会发送到该服务" : "尚未配置账号"}
                </span>
              </span>
              {selected && <CheckBubble />}
              <button
                type="button"
                aria-label={`${provider.name}账号`}
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
      <GroupNote>
        识别服务用于搜索、聊天与编辑器的语音输入。点已配置的服务即切换，点右侧箭头修改账号。
      </GroupNote>
      <SpeechRefinementGroup />
      {providers.length === 0 && (
        <>
          <div className="h-2" />
          <GroupCard>
            <GroupRow onClick={() => navigator.push("plugins", { tab: "store" })}>
              <Puzzle size={18} className="text-accent-text" aria-hidden="true" />
              <span className="text-accent-text text-tau-body flex-1 font-medium">
                安装语音识别插件
              </span>
              <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
            </GroupRow>
          </GroupCard>
        </>
      )}
    </div>
  );
}
