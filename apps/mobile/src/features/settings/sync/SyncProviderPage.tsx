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
import { findSyncProvider } from "./providers";
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
        <span className="text-ink-1 block text-[14px] font-medium">连接正常</span>
        <span className="text-ink-3 block text-[11.5px]">
          {remote > 0 ? `云端已有数据库 v${remote}` : "云端还没有数据"}
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
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [confirmVersions, setConfirmVersions] = useState<SyncVersionResponse | null>(null);

  const provider = findSyncProvider(props.providerId);
  const setting = app.syncSettings.safeSetting;
  const updateSetting = app.syncSettings.updateSetting;

  if (!provider || !setting) {
    return (
      <div className="bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title="同步服务" onBack={() => navigator.goBack("ui")} />
        <p className="text-ink-3 p-8 text-center text-[13px]">找不到这个同步服务</p>
      </div>
    );
  }

  const isActive = setting.sync.active === provider.id;
  const configured = provider.isConfigured(setting);
  const Panel = provider.Panel;

  const probe = async (): Promise<ProbeResult> => {
    setProbing(true);
    try {
      // 后端从 setting.json 读取配置，先落盘刚输入但尚未失焦保存的字段
      await app.syncSettings.persistSetting();
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

  const activate = () => {
    setConfirmVersions(null);
    updateSetting(prev => ({ ...prev, sync: { ...prev.sync, active: provider.id } }), {
      persist: true,
    });
    // 留在本页（按钮变为「当前同步服务」）；返回同步中心时会按新服务重新检查
    toast.success(`已改为同步到 ${provider.name}，返回即可同步`);
  };

  const handleActivate = async () => {
    const result = await probe();
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    if (result.versions.remoteVersion === 0) {
      activate();
      return;
    }
    setConfirmVersions(result.versions);
  };

  const openModule = (module: SettingModuleKey) => navigator.push("settingsModule", { module });

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader title={provider.name} onBack={() => navigator.goBack("ui")} />
      <div
        ref={scrollRef}
        className="edge-fade-scroll mobile-kb-scroll flex-1 overflow-y-auto px-4"
        style={{ paddingBottom: "calc(var(--kb-height, 0px) + 24px)" }}
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
        <p className="text-ink-3 pb-2 text-center text-[11.5px]">补全账号与必填项后可测试与启用</p>
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
                onClick={activate}
                className="bg-accent text-ink-inverse h-12 flex-1 rounded-[14px] text-[15px] font-semibold"
              >
                切换
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
