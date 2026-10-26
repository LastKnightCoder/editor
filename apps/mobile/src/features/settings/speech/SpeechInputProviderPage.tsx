// 识别插件账号页：插件声明的字段 + 使用状态。顶栏「保存」显式保存，保存不改变当前选用。

import { useRef, useState } from "react";
import { Mic } from "lucide-react";
import { copyJson } from "@tau/plugins/host";
import { PortalScope } from "@tau/ui";
import { defaultSpeechInputSetting } from "@tau/asr";
import type { JsonValue } from "@tau/plugins";
import { PageHeader, PageHeaderTextButton } from "../../../components/PageHeader";
import { GroupLabel } from "../../../components/GroupLabel";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import { useMobilePlugins } from "../../../app/plugins/context";
import { useEdgeFade } from "../../../hooks/useScrollState";
import {
  enqueueProviderConfigWrite,
  mergeProviderSettings,
} from "../../../services/provider-config";
import { savePluginProviderConfig, selectPluginProvider } from "../../../services/tauri";
import { GroupCard } from "../components/ui";
import { MobileProviderForm } from "../storage/ProviderForm";
import { UnsupportedProvider, UseRow, useDiscardGuard } from "../storage/providerPage";
import { useProviderDraft } from "../storage/useProviderDraft";
import { useSpeechInputProviders } from "./providers";

export function SpeechInputProviderPage(props: { providerId: string }) {
  const app = useAppContext();
  const runtime = useMobilePlugins();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const provider = useSpeechInputProviders().find(item => item.id === props.providerId);
  const setting = app.syncSettings.safeSetting;
  const speech = setting?.speechInput ?? defaultSpeechInputSetting();
  const [activating, setActivating] = useState(false);

  const write = (operation: () => Promise<import("../../../types").SettingCompat>) =>
    enqueueProviderConfigWrite(async () => {
      const saved = await operation();
      app.syncSettings.updateSetting(previous => mergeProviderSettings(previous, saved));
    });

  const draft = useProviderDraft(
    provider?.form ?? null,
    setting && provider ? provider.stored(speech) : undefined,
    config =>
      write(() => {
        if (!runtime || !provider) throw new Error("插件尚未就绪");
        return savePluginProviderConfig(runtime.workspaceId, "asr", provider.id, {
          modelId: provider.modelId(speech),
          config: copyJson(config),
        });
      })
  );
  const back = useDiscardGuard(draft.dirty, draft.reset);

  if (!provider || !setting || !provider.form)
    return <UnsupportedProvider title="识别服务" legacy={!!provider && !provider.form} />;

  const active = speech.active === "plugin" && speech.plugin.id === provider.id;
  const configured = provider.isConfigured(speech);

  const activate = async () => {
    if (!runtime) return;
    setActivating(true);
    try {
      await write(() =>
        selectPluginProvider(
          runtime.workspaceId,
          "asr",
          provider.id,
          copyJson(speech.plugin.configurations[provider.id] as JsonValue) as JsonValue
        )
      );
      toast.success(`语音输入改用 ${provider.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换失败");
    } finally {
      setActivating(false);
    }
  };

  return (
    <PortalScope>
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader
          title={provider.name}
          onBack={back.request}
          actions={
            <PageHeaderTextButton
              disabled={(!draft.dirty && configured) || draft.saving}
              onClick={async () => {
                if (await draft.save()) toast.success("账号已保存");
              }}
            >
              {draft.saving ? "保存中" : "保存"}
            </PageHeaderTextButton>
          }
        />
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4"
        >
          <div className="page-enter space-y-1">
            <GroupLabel>使用</GroupLabel>
            <GroupCard>
              <UseRow
                icon={<Mic size={17} strokeWidth={1.9} aria-hidden="true" />}
                title="语音输入"
                active={active}
                activeText="语音输入正在使用此服务"
                idleText={configured ? "账号已保存，尚未使用" : "填写下方账号并保存后可使用"}
                actionLabel="设为当前"
                busy={activating}
                disabled={!configured || draft.dirty}
                onAction={() => void activate()}
              />
            </GroupCard>
            <MobileProviderForm
              form={provider.form}
              values={draft.values}
              errors={draft.errors}
              disabled={draft.saving}
              signal={draft.signal}
              onChange={draft.change}
            />
            {draft.error && (
              <p role="alert" className="text-danger text-tau-meta px-[15px] pt-2">
                {draft.error}
              </p>
            )}
            <p className="text-ink-3 text-tau-sm px-[15px] pt-3 leading-relaxed">
              录音会发送到 {provider.name} 的服务进行识别。
            </p>
          </div>
        </div>
        {back.sheet}
      </div>
    </PortalScope>
  );
}
