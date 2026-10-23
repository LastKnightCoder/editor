// 「图片与附件」页：目的地卡回答「新图片存到哪、传得上去吗」，更换位置走抽屉 → 服务页；
// 资源文件同步不在这里（它跟随同步服务，在同步中心管理），只留一个跳转行。

import { useState, useSyncExternalStore } from "react";
import { ChevronRight, CircleAlert, CircleCheck, Image, RefreshCw, Shrink } from "lucide-react";
import type { SettingCompat } from "../../../types";
import { GroupLabel } from "../../../components/GroupLabel";
import { toast } from "../../../components/toast";
import { useNavigator, usePageLifecycle } from "../../../router";
import { readUploadOutcome, subscribeUploadOutcome } from "../../../services/uploadOutcome";
import type { SettingModuleKey, SettingsPageProps } from "../components/types";
import { GroupCard, GroupNote, GroupRow, LetterTile, SwitchButton } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { LOCAL_UPLOAD_ID, findUploadProvider } from "./providers";
import { LocalTile, UploadTargetSheet } from "./UploadTargetSheet";
import { deriveDestinationState, type DestinationState } from "./uploadState";

const STATE_TONE: Record<DestinationState["tone"], string> = {
  ok: "text-ink-2",
  info: "text-ink-2",
  warn: "text-danger",
};

function StateIcon(props: { tone: DestinationState["tone"] }) {
  if (props.tone === "warn") return <CircleAlert size={14} aria-hidden="true" />;
  if (props.tone === "ok") return <CircleCheck size={14} className="text-ok" aria-hidden="true" />;
  return <RefreshCw size={14} className="text-info" aria-hidden="true" />;
}

function IconBox(props: { children: React.ReactNode }) {
  return (
    <span className="bg-page text-ink-2 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
      {props.children}
    </span>
  );
}

export function UploadCenterSection(props: {
  setting: SettingCompat | null;
  updateSetting: SettingsPageProps["updateSetting"];
  onOpenModule: (module: SettingModuleKey) => void;
}) {
  const navigator = useNavigator();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const outcome = useSyncExternalStore(subscribeUploadOutcome, readUploadOutcome);
  // 从编辑器或服务页返回时刷新相对时间
  usePageLifecycle({ onResume: () => setNow(Date.now()) });

  if (!props.setting) {
    return null;
  }
  const setting = props.setting;
  const activeId = setting.imageBed.active;
  const isLocal = activeId === LOCAL_UPLOAD_ID;
  const provider = isLocal ? undefined : findUploadProvider(activeId);
  const configured = Boolean(provider?.isConfigured(setting));
  const state = deriveDestinationState({ activeId, isLocal, configured, outcome, now });

  const openProvider = (providerId: string) => {
    setSheetOpen(false);
    navigator.push("uploadProvider", { providerId });
  };

  const selectLocal = () => {
    setSheetOpen(false);
    if (isLocal) return;
    props.updateSetting(
      prev => ({ ...prev, imageBed: { ...prev.imageBed, active: LOCAL_UPLOAD_ID } }),
      {
        persist: true,
      }
    );
    toast.success("之后的新图片会保存在这台手机");
  };

  const toggleCompression = () =>
    props.updateSetting(
      prev => ({
        ...prev,
        imageBed: { ...prev.imageBed, enableCompression: !prev.imageBed.enableCompression },
      }),
      { persist: true }
    );

  const name = isLocal ? "这台手机" : (provider?.name ?? activeId);
  const summary = isLocal
    ? "不联网也能插图，占用本机空间"
    : (provider && configured && provider.summary(setting)) || "配置不完整";

  return (
    <div className="page-enter space-y-1">
      <section className="setting-group px-4 pb-3.5 pt-[18px]">
        <p className="text-ink-3 flex items-center gap-1.5 text-[12px]">
          <Image size={13} aria-hidden="true" />
          新插入的图片与附件保存到
        </p>
        <div className="mt-2.5 flex items-center gap-3">
          {isLocal || !provider ? (
            <LocalTile />
          ) : (
            <LetterTile letter={provider.tile.letter} className={provider.tile.className} />
          )}
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 block text-[19px] font-extrabold tracking-tight">
              {name}
            </span>
            <span className="text-ink-3 block truncate text-[12px]">{summary}</span>
          </span>
        </div>
        <p
          role="status"
          className={`border-line-2 mt-3 flex items-center gap-1.5 border-t pt-2.5 text-[12px] ${STATE_TONE[state.tone]}`}
        >
          <StateIcon tone={state.tone} />
          <span className="min-w-0 flex-1">{state.text}</span>
        </p>
      </section>

      <div className="flex gap-2.5 pt-3">
        <ActionButton label="更换位置" emphasis={false} onClick={() => setSheetOpen(true)} />
        {state.fixLabel && provider && (
          <ActionButton label={state.fixLabel} emphasis onClick={() => openProvider(provider.id)} />
        )}
      </div>

      <GroupLabel>处理</GroupLabel>
      <GroupCard>
        <GroupRow>
          <IconBox>
            <Shrink size={16} strokeWidth={1.9} aria-hidden="true" />
          </IconBox>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 block text-[14.5px] font-medium">压缩大图</span>
            <span className="text-ink-3 block text-[11.5px]">
              超过 300KB 转为 WebP，长边不超过 2048；关闭则上传原图
            </span>
          </span>
          <SwitchButton checked={setting.imageBed.enableCompression} onChange={toggleCompression} />
        </GroupRow>
      </GroupCard>
      <GroupNote>已插入的图片保留原地址，更换位置只影响之后的新图片。</GroupNote>

      <GroupLabel>相关</GroupLabel>
      <GroupCard>
        <GroupRow onClick={() => props.onOpenModule("sync-status-resource")}>
          <IconBox>
            <RefreshCw size={16} strokeWidth={1.9} aria-hidden="true" />
          </IconBox>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 block text-[14.5px] font-medium">资源文件同步</span>
            <span className="text-ink-3 block truncate text-[11.5px]">
              本机图片在设备间同步，跟随「同步」中的服务
            </span>
          </span>
          <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
        </GroupRow>
      </GroupCard>

      <UploadTargetSheet
        open={sheetOpen}
        setting={setting}
        onClose={() => setSheetOpen(false)}
        onSelectLocal={selectLocal}
        onOpenProvider={openProvider}
      />
    </div>
  );
}
