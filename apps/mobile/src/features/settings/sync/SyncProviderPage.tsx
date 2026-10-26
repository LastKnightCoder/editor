// 同步服务页：插件声明的连接表单 + 使用状态。顶栏「保存」显式保存，保存后读取一次云端版本作为连接测试；
// 保存不改变当前选用，「设为同步服务」先探测目标云端，已有数据时再确认。

import { useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { PortalScope } from "@tau/ui";
import type { SyncVersionResponse } from "../../../types";
import { PageHeader, PageHeaderTextButton } from "../../../components/PageHeader";
import { GroupLabel } from "../../../components/GroupLabel";
import { useAppContext } from "../../../app/AppContext";
import { useEdgeFade } from "../../../hooks/useScrollState";
import { GroupCard, GroupRow } from "../components/ui";
import { useSaveProviderConfig } from "../providerEntries";
import { MobileProviderForm } from "../storage/ProviderForm";
import { UnsupportedProvider, UseRow, useDiscardGuard } from "../storage/providerPage";
import { useProviderDraft } from "../storage/useProviderDraft";
import { useSyncProviders } from "./providers";
import { resolveSyncErrorMessage } from "./syncErrors";
import { useSyncSwitch } from "./useSyncSwitch";

type ProbeResult =
  | { status: "ok"; versions: SyncVersionResponse }
  | { status: "error"; message: string };

function ConnectionRow(props: { probing: boolean; result: ProbeResult | null }) {
  if (props.probing)
    return (
      <GroupRow>
        <LoaderCircle size={18} className="text-ink-3 animate-spin" aria-hidden="true" />
        <span className="text-ink-2 text-tau-body flex-1">正在连接…</span>
      </GroupRow>
    );
  if (!props.result)
    return (
      <GroupRow>
        <span className="text-ink-3 text-tau-meta flex-1">保存后会自动测试连接</span>
      </GroupRow>
    );
  if (props.result.status === "error")
    return (
      <GroupRow>
        <CircleAlert size={18} className="text-danger shrink-0" aria-hidden="true" />
        <span className="text-danger text-tau-meta min-w-0 flex-1 leading-snug">
          {props.result.message}
        </span>
      </GroupRow>
    );
  const remote = props.result.versions.remoteVersion;
  return (
    <GroupRow>
      <Check size={18} className="text-ok shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 text-tau-body block font-medium">连接正常</span>
        <span className="text-ink-3 text-tau-sm block">
          {remote > 0 ? `云端已有数据库 v${remote}` : "云端还没有这个数据库，首次同步会上传"}
        </span>
      </span>
    </GroupRow>
  );
}

export function SyncProviderPage(props: { providerId: string }) {
  const app = useAppContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const provider = useSyncProviders().find(item => item.id === props.providerId);
  const setting = app.syncSettings.safeSetting;
  const persist = useSaveProviderConfig("sync");
  const draft = useProviderDraft(
    provider?.form ?? null,
    setting && provider ? provider.stored(setting) : undefined,
    config => persist(props.providerId, config)
  );
  const switcher = useSyncSwitch();
  const [probing, setProbing] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const back = useDiscardGuard(draft.dirty, draft.reset);

  if (!provider || !setting || !provider.form)
    return <UnsupportedProvider title="同步服务" legacy={!!provider && !provider.form} />;

  const isActive = setting.sync.active === "plugin" && setting.sync.plugin?.id === provider.id;
  const configured = provider.isConfigured(setting);

  const save = async () => {
    setResult(null);
    const saved = await draft.save();
    if (!saved) return;
    setProbing(true);
    try {
      const { versions } = await switcher.probe(provider.id);
      setResult({ status: "ok", versions });
    } catch (error) {
      setResult({
        status: "error",
        message: `配置已保存，但连接失败：${resolveSyncErrorMessage(error, "请检查账号与存储位置")}`,
      });
    } finally {
      setProbing(false);
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
              disabled={(!draft.dirty && configured) || draft.saving || probing}
              onClick={() => void save()}
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
                icon={<RefreshCw size={17} strokeWidth={1.9} aria-hidden="true" />}
                title="同步服务"
                active={isActive}
                activeText="数据库与资源文件正同步到这里"
                idleText={configured ? "配置已保存，尚未使用" : "填写下方配置并保存后可使用"}
                actionLabel="设为当前"
                busy={switcher.probing === provider.id}
                disabled={!configured || draft.dirty}
                onAction={() => void switcher.request(provider.id, provider.name)}
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
            <GroupLabel>连接</GroupLabel>
            <GroupCard>
              <ConnectionRow probing={probing} result={result} />
            </GroupCard>
          </div>
        </div>
        {switcher.sheet}
        {back.sheet}
      </div>
    </PortalScope>
  );
}
