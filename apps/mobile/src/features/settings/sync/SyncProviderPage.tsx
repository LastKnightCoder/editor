import { PortalScope } from "@tau/ui";
import {
  enqueueProviderConfigWrite,
  flushProviderConfigWrites,
  mergeProviderSettings,
} from "../../../services/provider-config";
import { getMobileSettingSnapshot } from "../../../services/mobileSettingsBridge";
import type { JsonValue } from "@tau/plugins";
// 同步服务页外壳：服务面板 + 连接测试 + 设为同步服务。切换前先探测目标服务，云端已有数据时再确认。

import { useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import type { SyncVersionResponse } from "../../../types";
import { BottomSheet } from "../../../components/BottomSheet";
import { GroupLabel } from "../../../components/GroupLabel";
import { PageHeader } from "../../../components/PageHeader";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import { useEdgeFade } from "../../../hooks/useScrollState";
import { useNavigator } from "../../../router";
import * as tauri from "../../../services/tauri";
import type { SettingModuleKey } from "../components/types";
import { GroupCard, GroupRow } from "../components/ui";
import { useSyncProviders } from "./providers";
import { resolveSyncErrorMessage } from "./syncErrors";

type ProbeResult =
  | { status: "ok"; versions: SyncVersionResponse; checkedAt: number }
  | { status: "error"; message: string };

function ConnectionRow(props: { probing: boolean; result: ProbeResult | null }) {
  if (props.probing) {
    return (
      <GroupRow>
        <LoaderCircle size={17} className="text-ink-3 animate-spin" aria-hidden="true" />
        <span className="text-ink-2 flex-1 text-[14px]">正在连接…</span>
      </GroupRow>
    );
  }
  if (!props.result) {
    return (
      <GroupRow>
        <span className="text-ink-3 flex-1 text-[13px]">尚未测试，填好配置后点「测试连接」</span>
      </GroupRow>
    );
  }
  if (props.result.status === "error") {
    return (
      <GroupRow>
        <CircleAlert size={17} className="text-danger shrink-0" aria-hidden="true" />
        <span className="text-danger min-w-0 flex-1 text-[13px] leading-snug">
          {props.result.message}
        </span>
      </GroupRow>
    );
  }
  const remote = props.result.versions.remoteVersion;
  return (
    <GroupRow>
      <Check size={17} className="text-ok shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 block text-[14px] font-medium">版本检查完成</span>
        <span className="text-ink-3 block text-[11.5px]">
          {remote > 0
            ? `云端已有数据库 v${remote}`
            : "未发现云端版本记录，首次上传还会验证写入权限"}
        </span>
      </span>
    </GroupRow>
  );
}

export function SyncProviderPage(props: { providerId: string }) {
  const app = useAppContext();
  const navigator = useNavigator();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });
  const expectedConfig = useRef<JsonValue>(null);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [confirmVersions, setConfirmVersions] = useState<SyncVersionResponse | null>(null);

  const providers = useSyncProviders();
  const provider = providers.find(item => item.id === props.providerId);
  const setting = app.syncSettings.safeSetting;
  const updateSetting = app.syncSettings.updateSetting;

  if (!provider || !setting) {
    return (
      <div className="bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title="同步服务" onBack={() => navigator.goBack("ui")} />
        <p className="text-ink-3 p-8 text-center text-[13px]">
          此服务尚未启用，已保存的配置会保留。
        </p>
        <button
          type="button"
          className="text-accent-text p-4"
          onClick={() => navigator.push("plugins", { tab: "store" })}
        >
          去插件中心
        </button>
      </div>
    );
  }

  const isActive = setting.sync.active === "plugin" && setting.sync.plugin?.id === provider.id;
  const configured = provider.isConfigured(setting);
  const Panel = provider.Panel;

  const probe = async (): Promise<ProbeResult> => {
    setProbing(true);
    try {
      // 后端从 setting.json 读取配置，先落盘刚输入但尚未失焦保存的字段
      await flushProviderConfigWrites();
      await app.syncSettings.persistSetting();
      expectedConfig.current =
        (getMobileSettingSnapshot() ?? app.syncSettings.safeSetting)?.sync.plugin?.configurations[
          provider.id
        ] ?? null;
      const versions = await tauri.syncCheckVersions(provider.id);
      const result: ProbeResult = { status: "ok", versions, checkedAt: Date.now() };
      setProbeResult(result);
      return result;
    } catch (error) {
      const result: ProbeResult = {
        status: "error",
        message: resolveSyncErrorMessage(error, "连接失败，请检查账号与存储位置"),
      };
      setProbeResult(result);
      return result;
    } finally {
      setProbing(false);
    }
  };

  const activate = async () => {
    try {
      await enqueueProviderConfigWrite(async () => {
        const saved = await tauri.selectPluginProvider(
          setting.database.active,
          "sync",
          provider.id,
          expectedConfig.current
        );
        updateSetting(previous => mergeProviderSettings(previous, saved));
      });
      setConfirmVersions(null);
      toast.success(`已改为同步到 ${provider.name}，返回即可同步`);
    } catch (error) {
      setProbeResult({ status: "error", message: resolveSyncErrorMessage(error, "切换服务失败") });
      toast.error(resolveSyncErrorMessage(error, "切换服务失败"));
    }
  };

  const handleActivate = async () => {
    const result = await probe();
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    if (result.versions.remoteVersion === 0) {
      await activate();
      return;
    }
    setConfirmVersions(result.versions);
  };

  const openModule = (module: SettingModuleKey) => navigator.push("settingsModule", { module });

  return (
    <PortalScope>
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title={provider.name} onBack={() => navigator.goBack("ui")} />
        <div
          ref={scrollRef}
          data-page-footer
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4"
        >
          <div className="page-enter space-y-1">
            <Panel setting={setting} updateSetting={updateSetting} onOpenModule={openModule} />
            <p className="text-ink-3 px-[15px] text-[11.5px]">修改会自动保存</p>
            <GroupLabel>连接</GroupLabel>
            <GroupCard>
              <ConnectionRow probing={probing} result={probeResult} />
            </GroupCard>
          </div>
        </div>
        <div
          className="flex gap-2.5 px-4 pt-2"
          style={{ paddingBottom: "calc(var(--page-bottom-inset) + 8px)" }}
        >
          <button
            type="button"
            disabled={!configured || probing}
            onClick={() => void probe()}
            className="bg-surface text-ink-1 shadow-card h-12 flex-1 rounded-[14px] text-[15px] font-semibold disabled:opacity-50"
          >
            测试连接
          </button>
          <button
            type="button"
            disabled={isActive || !configured || probing}
            onClick={() => void handleActivate()}
            className="bg-accent text-ink-inverse shadow-lift h-12 flex-1 rounded-[14px] text-[15px] font-semibold disabled:opacity-50"
          >
            {isActive ? "当前同步服务" : "设为同步服务"}
          </button>
        </div>
        {!configured && (
          <p className="text-ink-3 pb-2 text-center text-[11.5px]">
            补全账号与必填项后可测试与启用
          </p>
        )}

        <BottomSheet
          open={confirmVersions !== null}
          title={`改为同步到 ${provider.name}？`}
          onClose={() => setConfirmVersions(null)}
        >
          {confirmVersions && (
            <div className="space-y-3 pb-1">
              <p className="text-ink-2 text-center text-[12.5px] leading-relaxed">
                原服务上的数据会保留，之后的同步只走 {provider.name}。
              </p>
              <div className="bg-page text-ink-2 rounded-2xl px-4 py-3 text-[13px] leading-relaxed">
                {provider.name} 上已有一份数据库（v{confirmVersions.remoteVersion}），本机为 v
                {confirmVersions.localVersion}。切换后点「
                {confirmVersions.remoteVersion > confirmVersions.localVersion
                  ? "下载更新"
                  : "立即同步"}
                」会
                {confirmVersions.remoteVersion > confirmVersions.localVersion
                  ? "用云端版本替换本机数据库。"
                  : "用本机数据库覆盖云端。"}
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmVersions(null)}
                  className="bg-page text-ink-1 h-12 flex-1 rounded-[14px] text-[15px] font-semibold"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void activate()}
                  className="bg-accent text-ink-inverse h-12 flex-1 rounded-[14px] text-[15px] font-semibold"
                >
                  切换
                </button>
              </div>
            </div>
          )}
        </BottomSheet>
      </div>
    </PortalScope>
  );
}
