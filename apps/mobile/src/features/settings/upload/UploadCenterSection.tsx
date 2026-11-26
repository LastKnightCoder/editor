// 「图片与附件」页：目的地卡回答「新图片存到哪、传得上去吗」，更换位置走抽屉 → 服务页；
// 资源文件同步不在这里（它跟随同步服务，在同步中心管理），只留一个跳转行。

import { uploadFailureText } from "../../../services/uploadOutcome.i18n";
import { storageTranslator, useStorageI18n } from "../storage/i18n";
import { useState, useSyncExternalStore } from "react";
import { ChevronRight, CircleAlert, CircleCheck, Image, RefreshCw, Shrink } from "lucide-react";
import type { SettingCompat } from "../../../types";
import { GroupLabel } from "../../../components/GroupLabel";
import { useNavigator, usePageLifecycle } from "../../../router";
import { readUploadOutcome, subscribeUploadOutcome } from "../../../services/uploadOutcome";
import type { SettingModuleKey, SettingsPageProps } from "../components/types";
import { GroupCard, GroupNote, GroupRow, LetterTile, SwitchButton } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { LOCAL_UPLOAD_ID, useUploadProviders } from "./providers";
import { LocalTile } from "./UploadTargetsPage";
import { deriveDestinationState, type DestinationState } from "./uploadState";

const STATE_TONE: Record<DestinationState["tone"], string> = {
  ok: "text-ink-2",
  info: "text-ink-2",
  warn: "text-danger",
};

function StateIcon(props: { tone: DestinationState["tone"] }) {
  useStorageI18n();
  if (props.tone === "warn") return <CircleAlert size={14} aria-hidden="true" />;
  if (props.tone === "ok") return <CircleCheck size={14} className="text-ok" aria-hidden="true" />;
  return <RefreshCw size={14} className="text-info" aria-hidden="true" />;
}

function IconBox(props: { children: React.ReactNode }) {
  useStorageI18n();
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
  const language = useStorageI18n();
  const navigator = useNavigator();
  const providers = useUploadProviders();
  const [now, setNow] = useState(() => Date.now());
  const outcome = useSyncExternalStore(subscribeUploadOutcome, readUploadOutcome);
  // 从编辑器或服务页返回时刷新相对时间
  usePageLifecycle({ onResume: () => setNow(Date.now()) });

  if (!props.setting) {
    return null;
  }
  const setting = props.setting;
  const activeId =
    setting.imageBed.active === "local" ? "local" : (setting.imageBed.plugin?.id ?? "");
  const isLocal = activeId === LOCAL_UPLOAD_ID;
  const provider = isLocal ? undefined : providers.find(item => item.id === activeId);
  const configured = Boolean(provider?.isConfigured(setting));
  const state = deriveDestinationState(
    { activeId, isLocal, configured, outcome, now },
    { ...language, failureText: uploadFailureText }
  );

  const openProvider = (providerId: string) => navigator.push("uploadProvider", { providerId });

  const toggleCompression = () =>
    props.updateSetting(
      prev => ({
        ...prev,
        imageBed: { ...prev.imageBed, enableCompression: !prev.imageBed.enableCompression },
      }),
      { persist: true }
    );

  const name = isLocal
    ? storageTranslator.t("phone.title")
    : (provider?.name ?? storageTranslator.t("phone.unavailable"));
  const summary = isLocal
    ? storageTranslator.t("phone.summary")
    : (provider && configured && provider.summary(setting)) ||
      storageTranslator.t("phone.incomplete");

  return (
    <div className="page-enter space-y-1">
      <section className="setting-group px-4 pt-[18px] pb-3.5">
        <p className="text-ink-3 text-tau-sm flex items-center gap-1.5">
          <Image size={13} aria-hidden="true" />
          {storageTranslator.t("phone.destination")}
        </p>
        <div className="mt-2.5 flex items-center gap-3">
          {isLocal || !provider ? (
            <LocalTile />
          ) : (
            <LetterTile letter={provider.tile.letter} className={provider.tile.className} />
          )}
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-title-lg block font-extrabold tracking-tight">
              {name}
            </span>
            <span className="text-ink-3 text-tau-sm block truncate">{summary}</span>
          </span>
        </div>
        <p
          role="status"
          className={`border-line-2 text-tau-sm mt-3 flex items-center gap-1.5 border-t pt-2.5 ${STATE_TONE[state.tone]}`}
        >
          <StateIcon tone={state.tone} />
          <span className="min-w-0 flex-1">{state.text}</span>
        </p>
      </section>

      <div className="flex gap-2.5 pt-3">
        <ActionButton
          label={storageTranslator.t("phone.change")}
          emphasis={false}
          onClick={() => navigator.push("uploadTargets", {})}
        />
        {state.fixLabel && provider && (
          <ActionButton label={state.fixLabel} emphasis onClick={() => openProvider(provider.id)} />
        )}
      </div>

      <GroupLabel>{storageTranslator.t("processing.title")}</GroupLabel>
      <GroupCard>
        <GroupRow>
          <IconBox>
            <Shrink size={16} strokeWidth={1.9} aria-hidden="true" />
          </IconBox>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-body block font-medium">
              {storageTranslator.t("phone.compress")}
            </span>
            <span className="text-ink-3 text-tau-sm block">
              {storageTranslator.t("phone.compressHint")}
            </span>
          </span>
          <SwitchButton checked={setting.imageBed.enableCompression} onChange={toggleCompression} />
        </GroupRow>
      </GroupCard>
      <GroupNote>{storageTranslator.t("phone.originals")}</GroupNote>

      <GroupLabel>{storageTranslator.t("phone.related")}</GroupLabel>
      <GroupCard>
        <GroupRow onClick={() => props.onOpenModule("sync-status-resource")}>
          <IconBox>
            <RefreshCw size={16} strokeWidth={1.9} aria-hidden="true" />
          </IconBox>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-body block font-medium">
              {storageTranslator.t("phone.resourceSync")}
            </span>
            <span className="text-ink-3 text-tau-sm block truncate">
              {storageTranslator.t("phone.resourceHint")}
            </span>
          </span>
          <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
        </GroupRow>
      </GroupCard>
    </div>
  );
}
